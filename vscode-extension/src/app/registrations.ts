import * as vscode from 'vscode';
import { AIInlineCompletionProvider, InlineCompletionClient } from '../completion/provider';
import { acceptCompletion } from '../commands/accept';
import { dismissCompletion } from '../commands/dismiss';
import { Settings } from '../config/settings';
import { StatusBarManager } from '../status/status-bar';

export interface RuntimeActions {
    restart(): Promise<void>;
    clearServerCache(): Promise<void>;
}

export function registerExtensionContributions(
    context: vscode.ExtensionContext,
    client: InlineCompletionClient,
    settings: Settings,
    statusBar: StatusBarManager,
    actions: RuntimeActions
): void {
    const provider = new AIInlineCompletionProvider(client, settings);

    context.subscriptions.push(
        provider,
        vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, provider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('aiTabComplete.trigger', () => {
            void vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('aiTabComplete.accept', () => {
            void acceptCompletion();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('aiTabComplete.dismiss', () => {
            void dismissCompletion();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('aiTabComplete.toggle', async () => {
            const current = settings.get<boolean>('enableAutoCompletion');
            await settings.set('enableAutoCompletion', !current);
            statusBar.showReady(!current);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('aiTabComplete.clearCache', async () => {
            await actions.clearServerCache();
            provider.clearCache();
            vscode.window.showInformationMessage('AI Tab Complete 缓存已清除');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('aiTabComplete.restart', async () => {
            await actions.restart();
        })
    );

    context.subscriptions.push(
        settings.onDidChange((key) => {
            if (key === 'enableAutoCompletion' || key === '*') {
                statusBar.showReady(settings.get<boolean>('enableAutoCompletion'));
            }
        })
    );
}
