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
    private client: LanguageClient | null = null;
    private readonly serverManager: ServerManager;
    private readonly streamUpdateCallbacks: StreamUpdateCallback[] = [];

    constructor(
        context: ExtensionContext,
        private readonly options: LspClientOptions
    ) {
        this.serverManager = new ServerManager(context);
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
                },
            },
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
            outputChannel: this.options.outputChannel,
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

        this.client.onNotification('custom/inlineCompletionUpdate', (params: unknown) => {
            this.streamUpdateCallbacks.forEach((callback) => callback(params as Parameters<StreamUpdateCallback>[0]));
        });

        await this.client.start();
        this.log('LSP client started');
    }

    async stop(): Promise<void> {
        if (!this.client) {
            return;
        }

        this.log('Stopping LSP client');
        await this.client.stop();
        this.client = null;
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
