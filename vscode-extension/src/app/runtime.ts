import * as vscode from 'vscode';
import { InlineCompletionClient } from '../completion/provider';
import { MockInlineCompletionClient } from '../completion/mock-client';
import { LspClient, StreamUpdateCallback } from '../lsp/client';
import { InlineCompletionList, InlineCompletionParams } from '../lsp/protocol';
import { Settings } from '../config/settings';
import { StatusBarManager } from '../status/status-bar';
import { registerExtensionContributions } from './registrations';

const RESTART_DELAY_MS = 2000;

class CompletionClientRouter implements InlineCompletionClient, vscode.Disposable {
    private client: InlineCompletionClient | null = null;
    private clientSubscription: vscode.Disposable | null = null;
    private callbacks = new Set<StreamUpdateCallback>();

    attach(client: InlineCompletionClient | null): void {
        this.clientSubscription?.dispose();
        this.client = client;

        if (!client) {
            this.clientSubscription = null;
            return;
        }

        this.clientSubscription = client.onStreamUpdate((params) => {
            this.callbacks.forEach((callback) => callback(params));
        });
    }

    async requestInlineCompletion(
        params: InlineCompletionParams,
        token?: vscode.CancellationToken
    ): Promise<InlineCompletionList | null> {
        return this.client?.requestInlineCompletion(params, token) ?? null;
    }

    async clearCache(): Promise<void> {
        await this.client?.clearCache();
    }

    onStreamUpdate(callback: StreamUpdateCallback): vscode.Disposable {
        this.callbacks.add(callback);
        return {
            dispose: () => {
                this.callbacks.delete(callback);
            },
        };
    }

    dispose(): void {
        this.clientSubscription?.dispose();
        this.callbacks.clear();
        this.client = null;
    }
}

export class ExtensionRuntime implements vscode.Disposable {
    private readonly settings = new Settings();
    private readonly statusBar = new StatusBarManager();
    private readonly clientRouter = new CompletionClientRouter();
    private readonly mockClient = new MockInlineCompletionClient();
    private readonly outputChannel = vscode.window.createOutputChannel('AI Tab Complete');
    private lspClient: LspClient | null = null;

    constructor(private readonly context: vscode.ExtensionContext) {}

    async activate(): Promise<void> {
        this.context.subscriptions.push(
            this,
            this.settings,
            this.statusBar,
            this.clientRouter,
            this.mockClient,
            this.outputChannel
        );

        this.logStartupBanner();
        this.statusBar.showInitializing();
        await this.startCompletionClient();

        registerExtensionContributions(
            this.context,
            this.clientRouter,
            this.settings,
            this.statusBar,
            {
                restart: () => this.restart(),
                clearServerCache: () => this.clientRouter.clearCache(),
            }
        );

        this.context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration((event) => {
                if (event.affectsConfiguration('aiTabComplete.useMockClient')) {
                    this.log(
                        `Configuration changed: useMockClient=${this.settings.get<boolean>('useMockClient')}`
                    );
                    void this.restart();
                }
            })
        );

        this.log('Extension activated');
    }

    async restart(): Promise<void> {
        this.log(`Restart requested, waiting ${RESTART_DELAY_MS}ms before restart`);
        this.statusBar.showInitializing();
        await this.stopCompletionClient();
        await new Promise((resolve) => setTimeout(resolve, RESTART_DELAY_MS));
        await this.startCompletionClient();
    }

    dispose(): void {
        void this.stopCompletionClient();
    }

    private async startCompletionClient(): Promise<void> {
        const startupConfig = this.getStartupConfigSnapshot();
        this.log(`Startup config: ${JSON.stringify(startupConfig)}`);

        if (this.settings.get<boolean>('useMockClient') ?? true) {
            this.clientRouter.attach(this.mockClient);
            this.statusBar.showReady(this.settings.get<boolean>('enableAutoCompletion'));
            this.log('Completion client ready: mode=mock');
            return;
        }

        try {
            this.log('Completion client mode=lsp');
            const nextClient = new LspClient(this.context, (message) => this.log(message));
            await nextClient.start();

            this.lspClient = nextClient;
            this.clientRouter.attach(nextClient);
            this.statusBar.showReady(this.settings.get<boolean>('enableAutoCompletion'));
            this.log('Completion client ready: mode=lsp');
        } catch (error) {
            console.error('Failed to start LSP server:', error);
            this.log(`Failed to start LSP server: ${this.stringifyError(error)}`);
            this.clientRouter.attach(null);
            this.lspClient = null;
            this.statusBar.showError('LSP Server 启动失败');
        }
    }

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
        const provider = this.settings.get<string>('provider');
        return {
            useMockClient: this.settings.get<boolean>('useMockClient'),
            provider,
            model: this.resolveProviderModel(provider),
            enableAutoCompletion: this.settings.get<boolean>('enableAutoCompletion'),
            enableStreaming: this.settings.get<boolean>('enableStreaming'),
            debounceMs: this.settings.get<number>('debounceMs'),
            maxTokens: this.settings.get<number>('maxTokens'),
            contextLinesBefore: this.settings.get<number>('contextLinesBefore'),
            contextLinesAfter: this.settings.get<number>('contextLinesAfter'),
            envLspPath: process.env.AI_TAB_COMPLETE_LSP_PATH ?? '(unset)',
        };
    }

    private resolveProviderModel(provider: string | undefined): string | undefined {
        switch (provider) {
            case 'claude':
                return this.settings.get<string>('claude.model');
            case 'openai':
                return this.settings.get<string>('openai.model');
            case 'ollama':
                return this.settings.get<string>('ollama.model');
            default:
                return undefined;
        }
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
