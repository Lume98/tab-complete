import * as vscode from 'vscode';
import { InlineCompletionClient } from '../completion/provider';
import { LspClient, StreamUpdateCallback } from '../lsp/client';
import { InlineCompletionList, InlineCompletionParams } from '../lsp/protocol';
import { Settings } from '../config/settings';
import { StatusBarManager } from '../status/status-bar';
import { registerExtensionContributions } from './registrations';

const RESTART_DELAY_MS = 2000;

class LspClientRouter implements InlineCompletionClient, vscode.Disposable {
    private client: LspClient | null = null;
    private clientSubscription: vscode.Disposable | null = null;
    private callbacks = new Set<StreamUpdateCallback>();

    attach(client: LspClient | null): void {
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
    private readonly clientRouter = new LspClientRouter();
    private readonly outputChannel = vscode.window.createOutputChannel('AI Tab Complete');
    private lspClient: LspClient | null = null;

    constructor(private readonly context: vscode.ExtensionContext) {}

    async activate(): Promise<void> {
        this.context.subscriptions.push(
            this,
            this.settings,
            this.statusBar,
            this.clientRouter,
            this.outputChannel
        );

        this.statusBar.showInitializing();
        await this.startLspServer();

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

        this.outputChannel.appendLine('AI Tab Complete activated');
    }

    async restart(): Promise<void> {
        this.statusBar.showInitializing();
        await this.stopLspServer();
        await new Promise((resolve) => setTimeout(resolve, RESTART_DELAY_MS));
        await this.startLspServer();
    }

    dispose(): void {
        void this.stopLspServer();
    }

    private async startLspServer(): Promise<void> {
        try {
            const nextClient = new LspClient(this.context);
            await nextClient.start();

            this.lspClient = nextClient;
            this.clientRouter.attach(nextClient);
            this.statusBar.showReady(this.settings.get<boolean>('enableAutoCompletion'));
        } catch (error) {
            console.error('Failed to start LSP server:', error);
            this.clientRouter.attach(null);
            this.lspClient = null;
            this.statusBar.showError('LSP Server 启动失败');
        }
    }

    private async stopLspServer(): Promise<void> {
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
