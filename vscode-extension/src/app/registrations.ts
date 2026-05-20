import * as vscode from 'vscode';
import { InlineCompletionClient } from '@/completion/client';
import { AIInlineCompletionProvider } from '@/completion/provider';
import { Settings } from '@/config/settings';
import { StatusIndicator } from '@/status/indicator';
import { CommandActions } from '@/commands/types';
import { registerCommands } from '@/commands';
import { registerSettingsChangeSync } from '@/app/register-settings-change-sync';

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
    indicator: StatusIndicator,
    actions: Pick<CommandActions, 'restart' | 'clearServerCache'>
): void {
    const provider = new AIInlineCompletionProvider(client, settings);
    const documentSelector: vscode.DocumentSelector = [
        { scheme: 'file', language: '*' },
        { scheme: 'untitled', language: '*' },
    ];

    // 与 LSP 客户端保持一致，只接管本地文件和未保存缓冲区。
    // 运行时保护检查（enableAutoCompletion、取消、防抖、缓存）仍在 provider 内部执行。
    context.subscriptions.push(
        provider,
        vscode.languages.registerInlineCompletionItemProvider(documentSelector, provider)
    );

    registerCommands(context, {
        settings,
        actions: {
            ...actions,
            clearClientCache: () => provider.clearCache(),
        },
    });
    registerSettingsChangeSync(context, settings, indicator);
}
