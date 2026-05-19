import assert from 'node:assert/strict';
import test from 'node:test';
import { MockCompletionBuilder } from '@/completion/mock-completion-builder';

test('MockCompletionBuilder returns language-specific return values', () => {
    const builder = new MockCompletionBuilder();

    assert.equal(builder.build('return ', 'python'), 'None');
    assert.equal(builder.build('return ', 'rust'), 'Ok(())');
    assert.equal(builder.build('return ', 'go'), 'nil');
    assert.equal(builder.build('return ', 'typescript'), 'null;');
});

test('MockCompletionBuilder clamps empty prefixes to language skeletons', () => {
    const builder = new MockCompletionBuilder();

    assert.equal(builder.build('', 'typescript'), 'const mockValue = await Promise.resolve();');
    assert.equal(builder.build('   ', 'python'), 'mock_value = None');
});
