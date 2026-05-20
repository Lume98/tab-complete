import * as vscode from 'vscode';
import { ClientRuntime } from '@/bootstrap/runtime/client-runtime';
import { RuntimeLogger } from '@/bootstrap/runtime/runtime-logger';
import { SettingsRestartPolicy } from '@/bootstrap/runtime/settings-restart-policy';
import { registerExtensionContributions } from '@/bootstrap/registrations/register-extension-contributions';
import { registerCompletionContributions } from '@/bootstrap/registrations/register-completion-contributions';
import { registerCommandContributions } from '@/bootstrap/registrations/register-command-contributions';
import { registerConfigurationSync } from '@/bootstrap/registrations/register-configuration-sync';
import { CompletionClientRouter } from '@/core/completion-client/completion-client-router';
import { MockInlineCompletionClient } from '@/core/completion-client/mock-inline-completion-client';
import { Settings } from '@/core/config/settings';
import { StatusIndicator } from '@/core/status/status-indicator';
import { LspClient } from '@/core/lsp/lsp-client';

export class ExtensionRuntime {
    private readonly settings = new Settings();
    private readonly indicator = new StatusIndicator();
    private readonly logger = new RuntimeLogger();
    private readonly restartPolicy = new SettingsRestartPolicy();
    private readonly clientRouter = new CompletionClientRouter({
        streamListenerMaxFailures: this.settings.get<number>('streamListenerMaxFailures', null),
    });
    private readonly mockClient = new MockInlineCompletionClient();
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
    private readonly ownedDisposables: vscode.Disposable[] = [];

    constructor(private readonly context: vscode.ExtensionContext) {}

    async activate(): Promise<void> {
        this.ownedDisposables.push(
            this.settings,
            this.indicator,
            this.logger,
            this.clientRouter,
            this.mockClient
        );

        this.logStartupBanner();
        await this.clientRuntime.start();

        registerExtensionContributions(
            this.context,
            {
                client: this.clientRouter,
                settings: this.settings,
                actions: {
                    restart: () => this.clientRuntime.restart(),
                    clearServerCache: () => this.clientRouter.clearCache(),
                },
            },
            {
                registerCompletionContributions,
                registerCommandContributions,
                registerConfigurationSync,
            }
        );

        this.ownedDisposables.push(
            this.settings.onDidChange((key, value) => {
                const action = this.restartPolicy.decide(key, value);

                if (action.kind === 'hot-update-stream-listener-max-failures') {
                    this.clientRouter.updateStreamListenerMaxFailures(action.value);
                    this.logger.log(`Configuration hot-updated: ${key}=${String(value)}`);
                    return;
                }

                if (action.kind === 'restart') {
                    this.logger.log(`Configuration changed: ${key}=${String(value)}`);
                    void this.clientRuntime.restart();
                }
            })
        );

        this.logger.log('Extension activated');
    }

    async dispose(): Promise<void> {
        await this.clientRuntime.stop();
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
