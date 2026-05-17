export type ProviderName = 'claude' | 'openai' | 'ollama';

export const DEFAULT_PROVIDER: ProviderName = 'claude';

export const SUPPORTED_PROVIDERS: readonly ProviderName[] = [
    'claude',
    'openai',
    'ollama',
];

export const PROVIDER_MODEL_KEY_MAP: Record<ProviderName, string> = {
    claude: 'claude.model',
    openai: 'openai.model',
    ollama: 'ollama.model',
};

export const PROVIDER_MODEL_KEYS: readonly string[] = Object.values(PROVIDER_MODEL_KEY_MAP);

export function isProviderName(value: unknown): value is ProviderName {
    return typeof value === 'string' && (SUPPORTED_PROVIDERS as readonly string[]).includes(value);
}

export function resolveProviderOrFallback(value: unknown): {
    provider: ProviderName;
    fallbackApplied: boolean;
    original: unknown;
} {
    if (isProviderName(value)) {
        return { provider: value, fallbackApplied: false, original: value };
    }
    return { provider: DEFAULT_PROVIDER, fallbackApplied: true, original: value };
}

export function resolveProviderModel(
    providerValue: unknown,
    getSetting: (key: string) => string | undefined
): { provider: ProviderName; model: string | undefined; fallbackApplied: boolean; original: unknown } {
    const resolved = resolveProviderOrFallback(providerValue);
    return {
        provider: resolved.provider,
        model: getSetting(PROVIDER_MODEL_KEY_MAP[resolved.provider]),
        fallbackApplied: resolved.fallbackApplied,
        original: resolved.original,
    };
}
