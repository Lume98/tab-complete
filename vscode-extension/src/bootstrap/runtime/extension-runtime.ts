import * as vscode from 'vscode';
import { ClientRuntime } from '@/bootstrap/runtime/client-runtime';
import { RuntimeLogger } from '@/bootstrap/runtime/runtime-logger';
import { SettingsRestartPolicy } from '@/bootstrap/runtime/settings-restart-policy';
import { registerCompletionContributions } from '@/bootstrap/registrations/register-completion-contributions';
import { CompletionClientRouter } from '@/core/completion-client/completion-client-router';
import { MockInlineCompletionClient } from '@/core/completion-client/mock-inline-completion-client';
import { Settings } from '@/core/config/settings';
import { StatusIndicator } from '@/core/status/status-indicator';
import { LspClient } from '@/core/lsp/lsp-client';
import { registerCommands } from '@/commands';

export class ExtensionRuntime {
    // 配置管理：读取 VS Code Settings、环境变量、配置文件
    private readonly settings = new Settings();
    // 状态栏指示器：显示补全状态（就绪/初始化/错误）
    private readonly indicator = new StatusIndicator();
    // 日志输出：扩展输出通道 + LSP 通道
    private readonly logger = new RuntimeLogger();
    // 配置变更策略：决定是否需要 restart 或 hot-update
    private readonly restartPolicy = new SettingsRestartPolicy();
    // 补全客户端路由器：mock/LSP 切换、流式监听管理
    private readonly clientRouter = new CompletionClientRouter({
        streamListenerMaxFailures: this.settings.get<number>('streamListenerMaxFailures', null),
    });
    // 本地 mock 客户端：开发期默认使用，无需启动真实 LSP Server
    private readonly mockClient = new MockInlineCompletionClient();
    // 客户端生命周期管理：mock/LSP 启动/停止/重启的状态机
    private readonly clientRuntime = new ClientRuntime({
        settings: this.settings,
        clientRouter: this.clientRouter,
        mockClient: this.mockClient,
        indicator: this.indicator,
        logger: this.logger,
        createLspClient: () => new LspClient(this.context, {
            outputChannel: this.logger.getOutputChannel(),
            logger: {
                log: (message) => this.logger.scoped('lsp').log(message),
                warn: (message) => this.logger.scoped('lsp').warn(message),
                error: (...messages: unknown[]) => {
                    this.logger.scoped('lsp').error(messages.map((item) => String(item)).join(' '));
                },
            },
        }),
        onProviderFallback: (provider) => {
            void vscode.window.setStatusBarMessage(
                `AI Tab Complete: provider 无效，已回退到 ${provider}`,
                5000
            );
        },
    });
    // 需释放的资源列表：dispose 时反向遍历释放
    private readonly ownedDisposables: vscode.Disposable[] = [];

    constructor(private readonly context: vscode.ExtensionContext) {}

    async activate(): Promise<void> {
        // 1. 注册需释放的资源（依赖注入的所有单例）
        this.ownedDisposables.push(
            this.settings,
            this.indicator,
            this.logger,
            this.clientRouter,
            this.mockClient
        );

        this.logStartupBanner();

        // 2. 启动客户端运行时（mock 或 LSP，取决于 useMockClient 配置）
        await this.clientRuntime.start();

        // 3. 注册 VS Code 扩展贡献（命令、completion provider、配置同步）
        const completionHandle = registerCompletionContributions(
            this.context,
            this.clientRouter,
            this.settings
        );
        registerCommands(this.context, {
            settings: this.settings,
            actions: {
                restart: () => this.clientRuntime.restart(),
                clearServerCache: () => this.clientRouter.clearCache(),
                clearClientCache: () => completionHandle.clearClientCache(),
            },
        });

        // 4. 监听配置变更：restart 或 hot-update 流式监听参数
        this.ownedDisposables.push(
            this.settings.onDidChange((key, value) => {
                const action = this.restartPolicy.decide(key, value);

                if (action.kind === 'hot-update-stream-listener-max-failures') {
                    // hot-update：不重启，直接更新流式监听器参数
                    this.clientRouter.updateStreamListenerMaxFailures(action.value);
                    this.logger.log(`Configuration hot-updated: ${key}=${String(value)}`);
                    return;
                }

                if (action.kind === 'restart') {
                    // restart：释放当前客户端，重新启动
                    this.logger.log(`Configuration changed: ${key}=${String(value)}`);
                    void this.clientRuntime.restart();
                }
            })
        );

        this.logger.log('Extension activated');
    }

    async dispose(): Promise<void> {
        // 1. 停止客户端运行时（释放 mock/LSP 客户端）
        await this.clientRuntime.stop();
        // 2. 反向遍历释放所有单例资源
        for (const disposable of this.ownedDisposables.splice(0).reverse()) {
            disposable.dispose();
        }
    }

    private logStartupBanner(): void {
        const extension = this.context.extension;
        const workspaceFolders = vscode.workspace.workspaceFolders?.map((folder) => folder.name) ?? [];
        const extensionMode = vscode.ExtensionMode[this.context.extensionMode] ?? 'Unknown';

        this.logger.log(
            `Booting extension v${extension.packageJSON.version} (${extensionMode}) at ${extension.extensionPath}`
        );
        this.logger.log(
            `Workspace folders (${workspaceFolders.length}): ${workspaceFolders.length > 0 ? workspaceFolders.join(', ') : '(none)'}`
        );
    }
}
