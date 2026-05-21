import * as vscode from 'vscode';
import type { InlineCompletionClient } from '@/core/completion-client/inline-completion-client';
import type { Settings } from '@/core/config/settings';
import { AIInlineCompletionProvider } from '@/completion/provider';

export interface CompletionContributionHandle {
    clearClientCache(): void;
    dispose(): void;
}

export function registerCompletionContributions(
    context: vscode.ExtensionContext,
    client: InlineCompletionClient,
    settings: Settings
): CompletionContributionHandle {
    const provider = new AIInlineCompletionProvider(client, settings);
    const documentSelector: vscode.DocumentSelector = [
        { scheme: 'file', language: '*' },
        { scheme: 'untitled', language: '*' },
    ];
    const registration = vscode.languages.registerInlineCompletionItemProvider(
        documentSelector,
        provider
    );

    context.subscriptions.push(provider, registration);
    return {
        clearClientCache: () => provider.clearCache(),
        dispose: () => provider.dispose(),
    };
}
