import assert from 'node:assert/strict';
import test from 'node:test';
import { collectChangedKeys, shouldTriggerRestart } from '@/core/config/settings-utils';

test('collectChangedKeys returns concrete keys before wildcard', () => {
    const keys = collectChangedKeys((section) =>
        section === 'aiTabComplete.provider'
        || section === 'aiTabComplete'
    );

    assert.deepEqual(keys, ['provider']);
});

test('collectChangedKeys returns wildcard for namespace-only changes', () => {
    const keys = collectChangedKeys((section) => section === 'aiTabComplete');

    assert.deepEqual(keys, ['*']);
});

test('shouldTriggerRestart excludes streamListenerMaxFailures for hot update', () => {
    assert.equal(shouldTriggerRestart('streamListenerMaxFailures'), false);
    assert.equal(shouldTriggerRestart('provider'), true);
});

test('shouldTriggerRestart includes enableAutoCompletion', () => {
    assert.equal(shouldTriggerRestart('enableAutoCompletion'), true);
});
