import assert from 'node:assert/strict';
import test from 'node:test';
import { InlineCompletionRequestBuilder } from '@/completion/inline-completion-request-builder';

test('InlineCompletionRequestBuilder clamps character and builds aligned cache key', () => {
    const builder = new InlineCompletionRequestBuilder();
    const snapshot = builder.build({
        documentUri: 'file:///tmp/demo.ts',
        documentVersion: 4,
        line: 2,
        character: 99,
        lineText: 'const value',
        triggerKind: 1,
        provider: 'openai',
        model: 'gpt-4o',
    });

    assert.equal(snapshot.character, 11);
    assert.equal(snapshot.prefix, 'const value');
    assert.deepEqual(snapshot.params, {
        textDocument: { uri: 'file:///tmp/demo.ts' },
        position: { line: 2, character: 11 },
        context: { triggerKind: 1 },
    });
    assert.equal(snapshot.cacheKey, 'file:///tmp/demo.ts:4:2:const value:openai:gpt-4o');
});

test('InlineCompletionRequestBuilder clamps negative character to start of line', () => {
    const builder = new InlineCompletionRequestBuilder();
    const snapshot = builder.build({
        documentUri: 'file:///tmp/demo.ts',
        documentVersion: 1,
        line: 0,
        character: -5,
        lineText: 'abc',
        triggerKind: 0,
        provider: 'claude',
        model: '',
    });

    assert.equal(snapshot.character, 0);
    assert.equal(snapshot.prefix, '');
    assert.equal(snapshot.cacheKey, 'file:///tmp/demo.ts:1:0::claude:');
});
