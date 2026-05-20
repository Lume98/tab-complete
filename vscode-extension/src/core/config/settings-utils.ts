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
    'streamListenerMaxFailures',
] as const;

const RESTART_KEYS = WATCH_KEYS.filter(
    (key) => key !== 'enableAutoCompletion' && key !== 'debounceMs' && key !== 'streamListenerMaxFailures'
);

export function shouldTriggerRestart(key: string): boolean {
    return (RESTART_KEYS as readonly string[]).includes(key);
}

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
