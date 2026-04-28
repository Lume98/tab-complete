import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
} from 'vscode-languageclient/node';
import { ExtensionContext, workspace, window, CancellationToken, Disposable } from 'vscode';
import { ServerManager } from './server-manager';
import { InlineCompletionParams, InlineCompletionList } from './protocol';

/** 流式更新回调 */
export type StreamUpdateCallback = (params: {
    streamId: string;
    text: string;
    done: boolean;
}) => void;

export class LspClient {
    private client: LanguageClient | null = null;
    private serverManager: ServerManager;
    private streamUpdateCallbacks: StreamUpdateCallback[] = [];

    constructor(context: ExtensionContext) {
        this.serverManager = new ServerManager(context);
    }

    async start(): Promise<void> {
        const serverPath = this.serverManager.resolveBinaryPath();

        const serverOptions: ServerOptions = {
            command: serverPath,
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
                config: this.loadConfig(),
            },
            synchronize: {
                configurationSection: 'aiTabComplete',
                fileEvents: workspace.createFileSystemWatcher('**/*'),
            },
            outputChannel: window.createOutputChannel('AI Tab Complete LSP'),
        };

        this.client = new LanguageClient(
            'aiTabComplete',
            'AI Tab Complete',
            serverOptions,
            clientOptions
        );

        // 注册流式更新通知监听
        this.client.onNotification('custom/inlineCompletionUpdate', (params: any) => {
            this.streamUpdateCallbacks.forEach(cb => cb(params));
        });

        await this.client.start();
    }

    async stop(): Promise<void> {
        if (this.client) {
            await this.client.stop();
            this.client = null;
        }
    }

    async requestInlineCompletion(
        params: InlineCompletionParams,
        token?: CancellationToken
    ): Promise<InlineCompletionList | null> {
        if (!this.client) {
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
}
