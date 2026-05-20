import type { Disposable } from 'vscode';
import type { Settings } from '@/core/config/settings';
import type { CommandActions } from '@/commands/types';

export interface SubscriptionContext {
    subscriptions: {
        push(...items: Disposable[]): number;
    };
}

export function registerConfigurationSync(
    context: SubscriptionContext,
    settings: Pick<Settings, 'get' | 'onDidChange'>,
    actions: Pick<CommandActions, 'restart'>
): void {
    context.subscriptions.push(
        settings.onDidChange((key) => {
            if (key === 'enableAutoCompletion') {
                void actions.restart();
            }
        })
    );
}
