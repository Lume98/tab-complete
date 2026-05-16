import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
} from 'vscode-languageclient/node';
import {
    ExtensionContext,
    workspace,
    window,
    CancellationToken,
    Disposable,
    OutputChannel,
} from 'vscode';
import { ServerManager } from './server-manager';
import { InlineCompletionParams, InlineCompletionList } from './protocol';

/** 流式更新回调 */
export type StreamUpdateCallback = (params: {
    streamId: string;
    text: string;
    done: boolean;
}) => void;

/**
 * `vscode-languageclient` 的轻量封装。
 * 职责：
 * - 启停生命周期管理
 * - 初始化时传递配置快照
 * - inline completion 的请求/通知桥接
 */
export class LspClient {
    private client: LanguageClient | null = null;
    private serverManager: ServerManager;
    private streamUpdateCallbacks: StreamUpdateCallback[] = [];
    private readonly lspOutputChannel: OutputChannel;

    constructor(
        context: ExtensionContext,
        private readonly logger?: (message: string) => void
    ) {
        this.serverManager = new ServerManager(context);
        this.lspOutputChannel = window.createOutputChannel('AI Tab Complete LSP');
    }

    async start(): Promise<void> {
        const binaryInfo = this.serverManager.resolveBinaryInfo();
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

        const serverOptions: ServerOptions = {
            command: binaryInfo.path,
            args: ['--stdio'],
            options: {
                env: {
                    ...process.env,
                }
            }
        };

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
            outputChannel: this.lspOutputChannel,
        };

        this.log(
            `Starting LSP client: provider=${config.provider}, model=${this.resolveActiveModel(config)}, streaming=${config.enableStreaming}, autoCompletion=${config.enableAutoCompletion}`
        );

        this.client = new LanguageClient(
            'aiTabComplete',
            'AI Tab Complete',
            serverOptions,
            clientOptions
        );

        // 服务端通过自定义通知推送增量更新。
        // 在本地分发给订阅方（provider/router）。
        this.client.onNotification('custom/inlineCompletionUpdate', (params: any) => {
            this.streamUpdateCallbacks.forEach(cb => cb(params));
        });

        try {
            await this.client.start();
            this.log('LSP client started');
        } catch (error) {
            this.lspOutputChannel.dispose();
            throw error;
        }
    }

    async stop(): Promise<void> {
        if (this.client) {
            this.log('Stopping LSP client');
            await this.client.stop();
            this.client = null;
            this.log('LSP client stopped');
            this.lspOutputChannel.dispose();
        }
    }

    async requestInlineCompletion(
        params: InlineCompletionParams,
        token?: CancellationToken
    ): Promise<InlineCompletionList | null> {
        if (!this.client) {
            // 防止在重启窗口期被调用。
            return null;
        }
        try {
            const result = await this.client.sendRequest<InlineCompletionList>(
                'textDocument/inlineCompletion',
                params,
                token
            );
            return result;
        } catch (err) {
            console.error('Inline completion request failed:', err);
            return null;
        }
    }

    async clearCache(): Promise<void> {
        if (this.client) {
            try {
                // 通知为 fire-and-forget，不需要负载。
                await this.client.sendNotification('textDocument/clearCache');
            } catch (err) {
                console.error('Failed to clear cache:', err);
            }
        }
    }

    /** 注册流式更新回调 */
    onStreamUpdate(callback: StreamUpdateCallback): Disposable {
        this.streamUpdateCallbacks.push(callback);
        return {
            dispose: () => {
                const idx = this.streamUpdateCallbacks.indexOf(callback);
                if (idx >= 0) this.streamUpdateCallbacks.splice(idx, 1);
            }
        };
    }

    private loadConfig(): Record<string, unknown> {
        // key 名称需与服务端 Config schema 保持一致。
        const config = workspace.getConfiguration('aiTabComplete');
        return {
            provider: config.get('provider'),
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
        // provider/model 映射与设置键名存在隐式契约。
        switch (config.provider) {
            case 'claude':
                return config.claudeModel;
            case 'openai':
                return config.openaiModel;
            case 'ollama':
                return config.ollamaModel;
            default:
                return 'unknown';
        }
    }

    private log(message: string): void {
        this.logger?.(message);
    }
}
