const WATCH_KEYS = [
    'enableAutoCompletion',
    'debounceMs',
    'provider',
    'useMockClient',
    'enableStreaming',
    'maxTokens',
    'contextLinesBefore',
    'contextLinesAfter',
    'claude.model',
    'openai.model',
    'ollama.model',
] as const;

export function collectChangedKeys(
    affectsConfiguration: (section: string) => boolean
): string[] {
    const changedKeys: string[] = [];
    for (const key of WATCH_KEYS) {
        if (affectsConfiguration(`aiTabComplete.${key}`)) {
            changedKeys.push(key);
        }
    }

    if (affectsConfiguration('aiTabComplete') && changedKeys.length === 0) {
        changedKeys.push('*');
    }

    return changedKeys;
}
