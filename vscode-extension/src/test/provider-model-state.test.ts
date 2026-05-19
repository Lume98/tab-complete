import assert from 'node:assert/strict';
import test from 'node:test';
import { ProviderModelState } from '@/completion/provider-model-state';

test('ProviderModelState reports changes only when resolved provider or model changes', () => {
    const state = new ProviderModelState();
    const settings = new Map<string, string>([
        ['claude.model', 'claude-a'],
        ['openai.model', 'gpt-a'],
    ]);

    assert.equal(state.refresh('claude', (key) => settings.get(key)), true);
    assert.equal(state.getProvider(), 'claude');
    assert.equal(state.getModel(), 'claude-a');

    assert.equal(state.refresh('claude', (key) => settings.get(key)), false);

    settings.set('claude.model', 'claude-b');
    assert.equal(state.refresh('claude', (key) => settings.get(key)), true);
    assert.equal(state.getModel(), 'claude-b');
});

test('ProviderModelState falls back to default provider for invalid values', () => {
    const state = new ProviderModelState();

    assert.equal(state.refresh('invalid', () => undefined), false);
    assert.equal(state.getProvider(), 'claude');
    assert.equal(state.getModel(), '');
});
