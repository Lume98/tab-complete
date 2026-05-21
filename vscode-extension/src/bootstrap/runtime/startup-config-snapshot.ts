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

type LoggableSnapshot = Omit<StartupConfigSnapshot, 'fallbackApplied' | 'originalProviderValue'>;

export function createStartupConfigSnapshot(
    settings: Pick<Settings, 'get'>
): StartupConfigSnapshot {
    const resolved = resolveProviderModel(
        settings.get<string>('provider'),
        (key) => settings.get<string>(key)
    );
    return {
        useMockClient: settings.get<boolean>('useMockClient') ?? true,
        provider: resolved.provider,
        model: resolved.model,
        enableAutoCompletion: settings.get<boolean>('enableAutoCompletion') ?? true,
        enableStreaming: settings.get<boolean>('enableStreaming') ?? true,
        debounceMs: settings.get<number>('debounceMs'),
        maxTokens: settings.get<number>('maxTokens'),
        contextLinesBefore: settings.get<number>('contextLinesBefore'),
        contextLinesAfter: settings.get<number>('contextLinesAfter'),
        streamListenerMaxFailures: settings.get<number>('streamListenerMaxFailures'),
        envLspPath: process.env.AI_TAB_COMPLETE_LSP_PATH ?? '(unset)',
        fallbackApplied: resolved.fallbackApplied,
        originalProviderValue: resolved.original,
    };
}

export function toStartupConfigLogObject(snapshot: StartupConfigSnapshot): LoggableSnapshot {
    const { fallbackApplied: _, originalProviderValue: __, ...loggable } = snapshot;
    return loggable;
}
