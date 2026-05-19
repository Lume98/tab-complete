import * as vscode from 'vscode';
import { MockInlineCompletionClient } from '@/completion/mock-client';
import { CompletionClientRouter } from '@/completion/client-router';
import { LspClient } from '@/lsp/client';
import { Settings } from '@/config/settings';
import { StatusIndicator } from '@/status/indicator';
import { registerExtensionContributions } from '@/app/registrations';
import { resolveProviderModel } from '@/config/provider-config';
import { shouldTriggerRestart } from '@/config/settings-utils';

/** 停止旧客户端后等待此时间再启动新客户端，让进程资源充分释放 */
const RESTART_DELAY_MS = 2000;

/**
 * 扩展运行时 —— 管理扩展的完整生命周期。
 * 编排配置、状态指示器、补全客户端（Mock / LSP）和配置变更重启。
 */
export class ExtensionRuntime implements vscode.Disposable {
    private readonly settings = new Settings();
    private readonly indicator = new StatusIndicator();
    private readonly clientRouter = new CompletionClientRouter();
    private readonly mockClient = new MockInlineCompletionClient();
    private readonly outputChannel = vscode.window.createOutputChannel('AI Tab Complete');

    /** 当前活跃的 LSP 客户端，Mock 模式下为 null */
    private lspClient: LspClient | null = null;

    // 重启状态机：合并短时间内的多次重启请求
    private restarting = false;
    private restartQueued = false;

    constructor(private readonly context: vscode.ExtensionContext) {}

    async activate(): Promise<void> {
        this.context.subscriptions.push(
            this,
            this.settings,
            this.indicator,
            this.clientRouter,
            this.mockClient,
            this.outputChannel
        );

        this.logStartupBanner();
        this.indicator.showInitializing();
        await this.startCompletionClient();

        // 依赖 clientRouter 已就绪
        registerExtensionContributions(
            this.context,
            this.clientRouter,
            this.settings,
            this.indicator,
            {
                restart: () => this.restart(),
                clearServerCache: () => this.clientRouter.clearCache(),
            }
        );

        this.context.subscriptions.push(
            this.settings.onDidChange((key, value) => {
                if (!shouldTriggerRestart(key)) {
                    return;
                }
                this.log(`Configuration changed: ${key}=${String(value)}`);
                void this.restart();
            })
        );

        this.log('Extension activated');
    }

    /**
     * 重启补全后端。若重启正在进行，合并请求到下一轮。
     * 流程：stop → 等待 RESTART_DELAY_MS → start
     */
    async restart(): Promise<void> {
        if (this.restarting) {
            this.restartQueued = true;
            this.log('Restart already in progress; merged additional restart request');
            return;
        }

        this.restarting = true;
        try {
            do {
                this.restartQueued = false;
                this.log(`Restart requested, waiting ${RESTART_DELAY_MS}ms before restart`);
                this.indicator.showInitializing();
                await this.stopCompletionClient();
                await new Promise((resolve) => setTimeout(resolve, RESTART_DELAY_MS));
                await this.startCompletionClient();
            } while (this.restartQueued);
        } finally {
            this.restarting = false;
        }
    }

    dispose(): void {
        void this.stopCompletionClient();
    }

    private async startCompletionClient(): Promise<void> {
        const startupConfig = this.getStartupConfigSnapshot();
        this.log(`Startup config: ${JSON.stringify(startupConfig)}`);
        this.warnIfProviderFallbackApplied();

        if (this.settings.get<boolean>('useMockClient') ?? true) {
            this.clientRouter.attach(this.mockClient);
            this.syncIndicator();
            this.log('Completion client ready: mode=mock');
            return;
        }

        try {
            this.log('Completion client mode=lsp');
            const nextClient = new LspClient(this.context, (message) => this.log(message));
            await nextClient.start();

            // 仅在启动成功后替换指针，避免暴露半初始化客户端
            this.lspClient = nextClient;
            this.clientRouter.attach(nextClient);
            this.syncIndicator();
            this.log('Completion client ready: mode=lsp');
        } catch (error) {
            console.error('Failed to start LSP server:', error);
            this.log(`Failed to start LSP server: ${this.stringifyError(error)}`);
            this.clientRouter.attach(null);
            this.lspClient = null;
            this.indicator.showError('LSP Server 启动失败');
        }
    }

    private syncIndicator(): void {
        this.settings.get<boolean>('enableAutoCompletion', null)
            ? this.indicator.showReady()
            : this.indicator.showDisabled();
    }

    /** 关闭顺序：先解绑路由器 → 清空引用 → 关闭进程 */
    private async stopCompletionClient(): Promise<void> {
        const currentClient = this.lspClient;
        this.clientRouter.attach(null);
        this.lspClient = null;

        if (!currentClient) {
            this.log('No active LSP client to stop');
            return;
        }

        try {
            await currentClient.stop();
        } catch (error) {
            console.error('Error stopping LSP client:', error);
            this.log(`Error stopping LSP client: ${this.stringifyError(error)}`);
        }
    }

    private logStartupBanner(): void {
        const extension = this.context.extension;
        const workspaceFolders = vscode.workspace.workspaceFolders?.map((folder) => folder.name) ?? [];
        const extensionMode = vscode.ExtensionMode[this.context.extensionMode] ?? 'Unknown';

        this.log(
            `Booting extension v${extension.packageJSON.version} (${extensionMode}) at ${extension.extensionPath}`
        );
        this.log(
            `Workspace folders (${workspaceFolders.length}): ${workspaceFolders.length > 0 ? workspaceFolders.join(', ') : '(none)'}`
        );
    }

    private getStartupConfigSnapshot(): Record<string, unknown> {
        const resolved = resolveProviderModel(
            this.settings.get<string>('provider', null),
            (key) => this.settings.get<string>(key, null)
        );
        return {
            useMockClient: this.settings.get<boolean>('useMockClient', null),
            provider: resolved.provider,
            model: resolved.model,
            enableAutoCompletion: this.settings.get<boolean>('enableAutoCompletion', null),
            enableStreaming: this.settings.get<boolean>('enableStreaming', null),
            debounceMs: this.settings.get<number>('debounceMs', null),
            maxTokens: this.settings.get<number>('maxTokens', null),
            contextLinesBefore: this.settings.get<number>('contextLinesBefore', null),
            contextLinesAfter: this.settings.get<number>('contextLinesAfter', null),
            envLspPath: process.env.AI_TAB_COMPLETE_LSP_PATH ?? '(unset)',
        };
    }

    /** 检查 provider 配置是否触发了回退，回退时在状态栏短暂提示 */
    private warnIfProviderFallbackApplied(): void {
        const resolved = resolveProviderModel(
            this.settings.get<string>('provider', null),
            (key) => this.settings.get<string>(key, null)
        );
        if (!resolved.fallbackApplied) {
            return;
        }

        const warning = `Invalid provider "${String(resolved.original)}", fallback to "${resolved.provider}"`;
        this.log(warning);
        void vscode.window.setStatusBarMessage(`AI Tab Complete: provider 无效，已回退到 ${resolved.provider}`, 5000);
    }

    private stringifyError(error: unknown): string {
        if (error instanceof Error) {
            return error.stack ?? `${error.name}: ${error.message}`;
        }
        try {
            return JSON.stringify(error);
        } catch {
            return String(error);
        }
    }

    private log(message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] ${message}`);
    }
}
