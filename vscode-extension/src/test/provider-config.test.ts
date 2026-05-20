import assert from 'node:assert/strict';
import test from 'node:test';
import {
    DEFAULT_PROVIDER,
    resolveProviderModel,
} from '@/core/config/provider-config';
import { buildInlineCompletionCacheKey } from '@/completion/cache-key';

test('resolveProviderModel falls back on invalid provider and keeps model lookup aligned', () => {
    const resolved = resolveProviderModel('invalid', (key) => `model-for-${key}`);

    assert.equal(resolved.provider, DEFAULT_PROVIDER);
    assert.equal(resolved.model, 'model-for-claude.model');
    assert.equal(resolved.fallbackApplied, true);
});

test('buildInlineCompletionCacheKey includes document version provider and model', () => {
    const key = buildInlineCompletionCacheKey({
        documentUri: 'file:///tmp/a.ts',
        documentVersion: 7,
        line: 3,
        prefix: 'const x =',
        provider: 'openai',
        model: 'gpt-4o',
    });

    assert.equal(key, 'file:///tmp/a.ts:7:3:const x =:openai:gpt-4o');
});
