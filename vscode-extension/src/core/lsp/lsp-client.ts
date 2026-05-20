import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
} from 'vscode-languageclient/node';
import {
    ExtensionContext,
    workspace,
    CancellationToken,
    Disposable,
    OutputChannel,
} from 'vscode';
import { ServerManager } from '@/core/lsp/server-manager';
import type {
    InlineCompletionList,
    InlineCompletionParams,
} from '@/core/lsp/protocol';
import {
    resolveProviderModel,
} from '@/core/config/provider-config';
import type {
    StartableInlineCompletionClient,
    StreamUpdateCallback,
} from '@/core/completion-client/inline-completion-client';

export interface LspClientOptions {
    outputChannel: OutputChannel;
    logger?: Pick<Console, 'error' | 'warn'> & { log?: (message: string) => void };
}

export class LspClient implements StartableInlineCompletionClient {
    // tower-lsp LanguageClient 实例（延迟创建，start() 时初始化）
    private client: LanguageClient | null = null;
    // 二进制路径解析器：处理不同平台的二进制文件位置
    private readonly serverManager: ServerManager;
    // 流式更新回调列表：Server 推送 custom/inlineCompletionUpdate → 转发给 router
    private readonly streamUpdateCallbacks: StreamUpdateCallback[] = [];

    constructor(
        context: ExtensionContext,
        private readonly options: LspClientOptions
    ) {
        this.serverManager = new ServerManager(context);
    }

    async start(): Promise<void> {
        // 1. 解析 Rust LSP Server 二进制位置（扩展内置或环境变量覆盖）
        const binaryInfo = this.serverManager.resolveBinaryInfo();
        // 2. 加载初始化配置：provider、model、enableStreaming 等
        const config = this.loadConfig();

        this.log(
            `LSP binary resolved: source=${binaryInfo.source}, exists=${binaryInfo.exists}, platform=${binaryInfo.platform}, path=${binaryInfo.path}`
        );

        if (binaryInfo.envPath && binaryInfo.source !== 'env') {
            this.log(`LSP env override ignored because path does not exist: ${binaryInfo.envPath}`);
        }

        if (!binaryInfo.exists) {
            this.log(`LSP binary probes: ${binaryInfo.checkedPaths.join(' | ')}`);
        }

        // 3. 配置 LSP Server 启动参数：stdio 通信模式
        const serverOptions: ServerOptions = {
            command: binaryInfo.path,
            args: ['--stdio'],
            options: {
                env: {
                    ...process.env,
                },
            },
        };

        // 4. 配置 LSP Client 选项：文档选择器、初始化配置、文件监听
        const clientOptions: LanguageClientOptions = {
            documentSelector: [
                { scheme: 'file', language: '*' },
                { scheme: 'untitled', language: '*' },
            ],
            initializationOptions: {
                config,
            },
            synchronize: {
                configurationSection: 'aiTabComplete',
                fileEvents: workspace.createFileSystemWatcher('**/*'),
            },
            outputChannel: this.options.outputChannel,
        };

        this.log(
            `Starting LSP client: provider=${config.provider}, model=${this.resolveActiveModel(config)}, streaming=${config.enableStreaming}, autoCompletion=${config.enableAutoCompletion}`
        );

        // 5. 创建 LSP Client 实例
        this.client = new LanguageClient(
            'aiTabComplete',
            'AI Tab Complete',
            serverOptions,
            clientOptions
        );

        // 6. 监听流式更新通知（Server 推送 SSE token 更新）
        this.client.onNotification('custom/inlineCompletionUpdate', (params: unknown) => {
            this.streamUpdateCallbacks.forEach((callback) => callback(params as Parameters<StreamUpdateCallback>[0]));
        });

        // 7. 启动 LSP Client（托管进程启动/通信）
        await this.client.start();
        this.log('LSP client started');
    }

    async stop(): Promise<void> {
        if (!this.client) {
            return;
        }

        this.log('Stopping LSP client');
        // 关闭 LSP Client：停止进程、清理通信管道
        await this.client.stop();
        this.client = null;
        // 清空流式监听器列表
        this.streamUpdateCallbacks.length = 0;
        this.log('LSP client stopped');
    }

    async requestInlineCompletion(
        params: InlineCompletionParams,
        token?: CancellationToken
    ): Promise<InlineCompletionList | null> {
        if (!this.client) {
            return null;
        }

        try {
            // 同步请求：发送 textDocument/inlineCompletion 请求给 Rust Server
            return await this.client.sendRequest<InlineCompletionList>(
                'textDocument/inlineCompletion',
                params,
                token
            );
        } catch (error) {
            this.options.logger?.error?.('Inline completion request failed:', error);
            return null;
        }
    }

    async clearCache(): Promise<void> {
        if (!this.client) {
            return;
        }

        try {
            await this.client.sendNotification('textDocument/clearCache');
        } catch (error) {
            this.options.logger?.error?.('Failed to clear cache:', error);
        }
    }

    onStreamUpdate(callback: StreamUpdateCallback): Disposable {
        this.streamUpdateCallbacks.push(callback);
        return {
            dispose: () => {
                const index = this.streamUpdateCallbacks.indexOf(callback);
                if (index >= 0) {
                    this.streamUpdateCallbacks.splice(index, 1);
                }
            },
        };
    }

    private loadConfig(): Record<string, unknown> {
        const config = workspace.getConfiguration('aiTabComplete');
        const resolvedProvider = resolveProviderModel(
            config.get('provider'),
            (key) => config.get<string>(key)
        );
        return {
            provider: resolvedProvider.provider,
            model: resolvedProvider.model,
            maxTokens: config.get('maxTokens'),
            debounceMs: config.get('debounceMs'),
            contextLinesBefore: config.get('contextLinesBefore'),
            contextLinesAfter: config.get('contextLinesAfter'),
            enableAutoCompletion: config.get('enableAutoCompletion'),
            enableStreaming: config.get('enableStreaming'),
            claudeModel: config.get('claude.model'),
            openaiModel: config.get('openai.model'),
            ollamaModel: config.get('ollama.model'),
        };
    }

    private resolveActiveModel(config: Record<string, unknown>): unknown {
        return config.model ?? 'unknown';
    }

    private log(message: string): void {
        this.options.logger?.log?.(message);
    }
}
