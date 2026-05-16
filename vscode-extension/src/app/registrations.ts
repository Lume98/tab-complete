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

/**
 * 在一处注册所有 VS Code 贡献点：
 * - inline provider
 * - 用户命令
 * - 设置驱动的状态同步
 */
export function registerExtensionContributions(
    context: vscode.ExtensionContext,
    client: InlineCompletionClient,
    settings: Settings,
    statusBar: StatusBarManager,
    actions: RuntimeActions
): void {
    const provider = new AIInlineCompletionProvider(client, settings);

    // Provider 以全局模式（`**`）注册，并在内部自行执行保护检查
    // （enableAutoCompletion、取消、防抖、缓存）。
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
            // 先持久化到 VS Code 设置；UI 只反映已提交状态。
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
            // aiTabComplete 命名空间下任意配置变更都会发出 '*'。
            if (key === 'enableAutoCompletion' || key === '*') {
                statusBar.showReady(settings.get<boolean>('enableAutoCompletion'));
            }
        })
    );
}
