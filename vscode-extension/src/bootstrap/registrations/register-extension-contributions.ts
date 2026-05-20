import type { InlineCompletionClient } from '@/core/completion-client/inline-completion-client';
import type { Settings } from '@/core/config/settings';
import type { CommandActions } from '@/commands/types';
import type { SubscriptionContext } from '@/bootstrap/registrations/register-configuration-sync';

export interface CompletionContributionHandle {
    clearClientCache(): void;
    dispose(): void;
}

export interface ExtensionContributionDependencies {
    client: InlineCompletionClient;
    settings: Settings;
    actions: Pick<CommandActions, 'restart' | 'clearServerCache'>;
}

export interface ExtensionContributionRegistrars {
    registerCompletionContributions(
        context: SubscriptionContext,
        client: InlineCompletionClient,
        settings: Settings
    ): CompletionContributionHandle;
    registerCommandContributions(
        context: SubscriptionContext,
        settings: Settings,
        actions: CommandActions
    ): void;
    registerConfigurationSync(
        context: SubscriptionContext,
        settings: Settings,
        actions: Pick<CommandActions, 'restart'>
    ): void;
}

export function registerExtensionContributions(
    context: SubscriptionContext,
    deps: ExtensionContributionDependencies,
    registrars: ExtensionContributionRegistrars
): CompletionContributionHandle {
    const completionHandle = registrars.registerCompletionContributions(
        context,
        deps.client,
        deps.settings
    );

    registrars.registerCommandContributions(context, deps.settings, {
        ...deps.actions,
        clearClientCache: () => completionHandle.clearClientCache(),
    });
    registrars.registerConfigurationSync(context, deps.settings, {
        restart: deps.actions.restart,
    });

    return completionHandle;
}
