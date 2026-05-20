import assert from 'node:assert/strict';
import test from 'node:test';
import { registerExtensionContributions } from '@/bootstrap/registrations/register-extension-contributions';
import type { InlineCompletionClient } from '@/core/completion-client/inline-completion-client';
import type { Settings } from '@/core/config/settings';

test('registerExtensionContributions registers completion, commands and config sync', () => {
    const calls: string[] = [];
    const context = {
        subscriptions: {
            push: () => 0,
        },
    };

    const handle = registerExtensionContributions(
        context,
        {
            client: {} as InlineCompletionClient,
            settings: {} as Settings,
            actions: {
                restart: async () => undefined,
                clearServerCache: async () => undefined,
            },
        },
        {
            registerCompletionContributions: () => {
                calls.push('completion');
                return {
                    clearClientCache: () => calls.push('clear-client-cache'),
                    dispose: () => undefined,
                };
            },
            registerCommandContributions: (_ctx, _settings, actions) => {
                calls.push('commands');
                void actions.clearClientCache();
            },
            registerConfigurationSync: () => {
                calls.push('config-sync');
            },
        }
    );

    handle.clearClientCache();

    assert.deepEqual(calls, [
        'completion',
        'commands',
        'clear-client-cache',
        'config-sync',
        'clear-client-cache',
    ]);
});

test('registerExtensionContributions routes configuration sync through restart action', () => {
    const calls: string[] = [];
    const context = {
        subscriptions: {
            push: () => 0,
        },
    };

    registerExtensionContributions(
        context,
        {
            client: {} as InlineCompletionClient,
            settings: {} as Settings,
            actions: {
                restart: async () => {
                    calls.push('restart');
                },
                clearServerCache: async () => undefined,
            },
        },
        {
            registerCompletionContributions: () => ({
                clearClientCache: () => undefined,
                dispose: () => undefined,
            }),
            registerCommandContributions: () => undefined,
            registerConfigurationSync: (_ctx, _settings, actions) => {
                void actions.restart();
            },
        }
    );

    assert.deepEqual(calls, ['restart']);
});
