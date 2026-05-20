import {
    resolveProviderModel,
    type ProviderName,
} from '@/core/config/provider-config';
import type { Settings } from '@/core/config/settings';

export interface StartupConfigSnapshot {
    useMockClient: boolean;
    provider: ProviderName;
    model: string | undefined;
    enableAutoCompletion: boolean;
    enableStreaming: boolean;
    debounceMs: number | undefined;
    maxTokens: number | undefined;
    contextLinesBefore: number | undefined;
    contextLinesAfter: number | undefined;
    streamListenerMaxFailures: number | undefined;
    envLspPath: string;
    fallbackApplied: boolean;
    originalProviderValue: unknown;
}

export function createStartupConfigSnapshot(
    settings: Pick<Settings, 'get'>
): StartupConfigSnapshot {
    const resolved = resolveProviderModel(
        settings.get<string>('provider', null),
        (key) => settings.get<string>(key, null)
    );
    return {
        useMockClient: settings.get<boolean>('useMockClient', null) ?? true,
        provider: resolved.provider,
        model: resolved.model,
        enableAutoCompletion: settings.get<boolean>('enableAutoCompletion', null) ?? true,
        enableStreaming: settings.get<boolean>('enableStreaming', null) ?? true,
        debounceMs: settings.get<number>('debounceMs', null),
        maxTokens: settings.get<number>('maxTokens', null),
        contextLinesBefore: settings.get<number>('contextLinesBefore', null),
        contextLinesAfter: settings.get<number>('contextLinesAfter', null),
        streamListenerMaxFailures: settings.get<number>('streamListenerMaxFailures', null),
        envLspPath: process.env.AI_TAB_COMPLETE_LSP_PATH ?? '(unset)',
        fallbackApplied: resolved.fallbackApplied,
        originalProviderValue: resolved.original,
    };
}

export function toStartupConfigLogObject(
    snapshot: StartupConfigSnapshot
): Record<string, unknown> {
    return {
        useMockClient: snapshot.useMockClient,
        provider: snapshot.provider,
        model: snapshot.model,
        enableAutoCompletion: snapshot.enableAutoCompletion,
        enableStreaming: snapshot.enableStreaming,
        debounceMs: snapshot.debounceMs,
        maxTokens: snapshot.maxTokens,
        contextLinesBefore: snapshot.contextLinesBefore,
        contextLinesAfter: snapshot.contextLinesAfter,
        streamListenerMaxFailures: snapshot.streamListenerMaxFailures,
        envLspPath: snapshot.envLspPath,
    };
}
