import assert from 'node:assert/strict';
import test from 'node:test';
import { CompletionClientRouter } from '@/core/completion-client/completion-client-router';
import type { InlineCompletionClient, StreamUpdateCallback } from '@/core/completion-client/inline-completion-client';
import type { InlineCompletionList, InlineCompletionParams } from '@/core/lsp/protocol';

class FakeInlineCompletionClient implements InlineCompletionClient {
    private callback: StreamUpdateCallback | null = null;

    constructor(
        private readonly completionResult: InlineCompletionList | null = { items: [{ text: 'ok' }] }
    ) {}

    async requestInlineCompletion(
        _params: InlineCompletionParams
    ): Promise<InlineCompletionList | null> {
        return this.completionResult;
    }

    async clearCache(): Promise<void> {
        return Promise.resolve();
    }

    onStreamUpdate(callback: StreamUpdateCallback): { dispose(): void } {
        this.callback = callback;
        return {
            dispose: () => {
                if (this.callback === callback) {
                    this.callback = null;
                }
            },
        };
    }

    emit(params: Parameters<StreamUpdateCallback>[0]): void {
        this.callback?.(params);
    }
}

const silentLogger = {
    error: () => undefined,
    warn: () => undefined,
};

test('CompletionClientRouter isolates stream listener failures', async () => {
    const router = new CompletionClientRouter({ logger: silentLogger });
    const client = new FakeInlineCompletionClient();
    router.attach(client);

    let received = 0;
    router.onStreamUpdate(() => {
        received += 1;
    });
    router.onStreamUpdate(() => {
        throw new Error('listener failed');
    });

    client.emit({ streamId: 's-1', text: 'a', done: false });

    assert.equal(received, 1);
});

test('CompletionClientRouter accepts injected logger without changing behavior', async () => {
    const router = new CompletionClientRouter({
        logger: silentLogger,
    });
    const client = new FakeInlineCompletionClient();
    router.attach(client);

    const result = await router.requestInlineCompletion({} as InlineCompletionParams);

    assert.deepEqual(result, { items: [{ text: 'ok' }] });
});

test('CompletionClientRouter removes unstable listeners after repeated failures', async () => {
    const router = new CompletionClientRouter({
        streamListenerMaxFailures: 2,
        logger: silentLogger,
    });
    const client = new FakeInlineCompletionClient();
    router.attach(client);

    let calls = 0;
    router.onStreamUpdate(() => {
        calls += 1;
        throw new Error('listener failed');
    });

    client.emit({ streamId: 's-1', text: 'a', done: false });
    client.emit({ streamId: 's-1', text: 'b', done: false });
    client.emit({ streamId: 's-1', text: 'c', done: true });

    assert.equal(calls, 2);
});

test('CompletionClientRouter resets failure counters after threshold update', async () => {
    const router = new CompletionClientRouter({
        streamListenerMaxFailures: 5,
        logger: silentLogger,
    });
    const client = new FakeInlineCompletionClient();
    router.attach(client);

    let calls = 0;
    router.onStreamUpdate(() => {
        calls += 1;
        throw new Error('listener failed');
    });

    client.emit({ streamId: 's-1', text: 'a', done: false });
    client.emit({ streamId: 's-1', text: 'b', done: false });
    client.emit({ streamId: 's-1', text: 'c', done: false });
    client.emit({ streamId: 's-1', text: 'd', done: false });

    router.updateStreamListenerMaxFailures(3);

    client.emit({ streamId: 's-1', text: 'e', done: false });
    client.emit({ streamId: 's-1', text: 'f', done: false });

    assert.equal(calls, 6);
});

test('CompletionClientRouter detaches old stream subscription when attaching new client', () => {
    const router = new CompletionClientRouter({ logger: silentLogger });
    const firstClient = new FakeInlineCompletionClient();
    const secondClient = new FakeInlineCompletionClient();
    let received = 0;

    router.onStreamUpdate(() => {
        received += 1;
    });

    router.attach(firstClient);
    router.attach(secondClient);

    firstClient.emit({ streamId: 's-1', text: 'old', done: false });
    secondClient.emit({ streamId: 's-2', text: 'new', done: false });

    assert.equal(received, 1);
});

test('CompletionClientRouter returns null and resolves clearCache without active client', async () => {
    const router = new CompletionClientRouter({ logger: silentLogger });

    const result = await router.requestInlineCompletion({} as InlineCompletionParams);
    await router.clearCache();

    assert.equal(result, null);
});
