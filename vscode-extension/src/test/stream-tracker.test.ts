import assert from 'node:assert/strict';
import test from 'node:test';
import { StreamTracker } from '@/completion/stream-tracker';

test('StreamTracker ignores stale stream updates', () => {
    const tracker = new StreamTracker();

    tracker.track('stream-1', 'request-1', 'con');

    assert.equal(tracker.update('stream-2', 'stale'), false);
    assert.equal(tracker.getText(), 'con');
});

test('StreamTracker reports changes for the active stream', () => {
    const tracker = new StreamTracker();

    tracker.track('stream-1', 'request-1', 'con');

    assert.equal(tracker.update('stream-1', 'console.log(value)'), true);
    assert.equal(tracker.getText(), 'console.log(value)');
});

test('StreamTracker records completion when active stream finishes', () => {
    const tracker = new StreamTracker();

    tracker.track('stream-1', 'request-1', 'con');

    assert.equal(tracker.update('stream-1', 'console.log(value)', true), true);
    assert.equal(tracker.isDone(), true);
});

test('StreamTracker records completion even when final text is unchanged', () => {
    const tracker = new StreamTracker();

    tracker.track('stream-1', 'request-1', 'console.log(value)');

    assert.equal(tracker.update('stream-1', 'console.log(value)', true), true);
    assert.equal(tracker.isDone(), true);
});

test('StreamTracker binds active text to its request key', () => {
    const tracker = new StreamTracker();

    tracker.track('stream-1', 'request-1', 'con');

    assert.equal(tracker.hasActiveRequest('request-1'), true);
    assert.equal(tracker.hasActiveRequest('request-2'), false);
});
