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
                    void this.restart();
                }
            })
        );

        this.outputChannel.appendLine('AI Tab Complete activated');
    }

    async restart(): Promise<void> {
        this.statusBar.showInitializing();
        await this.stopCompletionClient();
        await new Promise((resolve) => setTimeout(resolve, RESTART_DELAY_MS));
        await this.startCompletionClient();
    }

    dispose(): void {
        void this.stopCompletionClient();
    }

    private async startCompletionClient(): Promise<void> {
        if (this.settings.get<boolean>('useMockClient') ?? true) {
            this.clientRouter.attach(this.mockClient);
            this.statusBar.showReady(this.settings.get<boolean>('enableAutoCompletion'));
            this.outputChannel.appendLine('AI Tab Complete running with mock completions');
            return;
        }

        try {
            const nextClient = new LspClient(this.context);
            await nextClient.start();

            this.lspClient = nextClient;
            this.clientRouter.attach(nextClient);
            this.statusBar.showReady(this.settings.get<boolean>('enableAutoCompletion'));
            this.outputChannel.appendLine('AI Tab Complete connected to LSP server');
        } catch (error) {
            console.error('Failed to start LSP server:', error);
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
            return;
        }

        try {
            await currentClient.stop();
        } catch (error) {
            console.error('Error stopping LSP client:', error);
        }
    }
}
