import assert from 'node:assert/strict';
import test from 'node:test';
import { ClientRuntime } from '@/bootstrap/runtime/client-runtime';
import type {
    InlineCompletionClient,
    StartableInlineCompletionClient,
    StreamUpdateCallback,
} from '@/core/completion-client/inline-completion-client';
import type { CompletionClientRouter } from '@/core/completion-client/completion-client-router';
import type { Settings } from '@/core/config/settings';
import type { InlineCompletionList, InlineCompletionParams } from '@/core/lsp/protocol';

class FakeClient implements InlineCompletionClient {
    async requestInlineCompletion(
        _params: InlineCompletionParams
    ): Promise<InlineCompletionList | null> {
        return null;
    }

    async clearCache(): Promise<void> {
        return Promise.resolve();
    }

    onStreamUpdate(_callback: StreamUpdateCallback) {
        return {
            dispose: () => undefined,
        };
    }
}

class FakeStartableClient extends FakeClient implements StartableInlineCompletionClient {
    startCalls = 0;
    stopCalls = 0;
    failOnStart = false;

    async start(): Promise<void> {
        this.startCalls += 1;
        if (this.failOnStart) {
            throw new Error('start failed');
        }
    }

    async stop(): Promise<void> {
        this.stopCalls += 1;
    }
}

function createTestContext(options?: {
    useMockClient?: boolean;
    enableAutoCompletion?: boolean;
    lspClientFactory?: () => FakeStartableClient;
}) {
    const attachments: Array<InlineCompletionClient | null> = [];
    const indicatorTransitions: string[] = [];
    const logs: string[] = [];
    const settingsValues = new Map<string, unknown>([
        ['useMockClient', options?.useMockClient ?? false],
        ['provider', 'claude'],
        ['claude.model', 'claude-model'],
        ['enableAutoCompletion', options?.enableAutoCompletion ?? true],
        ['enableStreaming', true],
        ['debounceMs', 150],
        ['maxTokens', 256],
        ['contextLinesBefore', 50],
        ['contextLinesAfter', 20],
        ['streamListenerMaxFailures', 3],
    ]);
    const createdLspClients: FakeStartableClient[] = [];
    const lspClientFactory = options?.lspClientFactory ?? (() => new FakeStartableClient());

    const runtime = new ClientRuntime({
        settings: {
            get: <T>(key: string) => settingsValues.get(key) as T,
        } as Pick<Settings, 'get'>,
        clientRouter: {
            attach: (client) => {
                attachments.push(client);
            },
            clearCache: async () => undefined,
            updateStreamListenerMaxFailures: () => undefined,
        } as Pick<CompletionClientRouter, 'attach' | 'clearCache' | 'updateStreamListenerMaxFailures'>,
        mockClient: new FakeClient(),
        indicator: {
            showInitializing: () => indicatorTransitions.push('initializing'),
            showReady: () => indicatorTransitions.push('ready'),
            showDisabled: () => indicatorTransitions.push('disabled'),
            showError: () => indicatorTransitions.push('error'),
        },
        logger: {
            log: (message) => logs.push(`log:${message}`),
            warn: (message) => logs.push(`warn:${message}`),
            error: (message) => logs.push(`error:${message}`),
        },
        createLspClient: () => {
            const client = lspClientFactory();
            createdLspClients.push(client);
            return client;
        },
        restartDelayMs: 0,
        delay: async () => undefined,
    });

    return {
        runtime,
        attachments,
        indicatorTransitions,
        logs,
        settingsValues,
        createdLspClients,
    };
}

test('ClientRuntime starts in mock mode successfully', async () => {
    const context = createTestContext({ useMockClient: true });

    await context.runtime.start();

    assert.equal(context.runtime.getState(), 'ready');
    assert.equal(context.attachments.length, 1);
    assert.ok(context.attachments[0] instanceof FakeClient);
    assert.deepEqual(context.indicatorTransitions, ['initializing', 'ready']);
});

test('ClientRuntime starts in lsp mode successfully', async () => {
    const context = createTestContext({ useMockClient: false });

    await context.runtime.start();

    assert.equal(context.runtime.getState(), 'ready');
    assert.equal(context.createdLspClients.length, 1);
    assert.equal(context.createdLspClients[0].startCalls, 1);
    assert.equal(context.attachments.at(-1), context.createdLspClients[0]);
});

test('ClientRuntime enters failed state when lsp start fails', async () => {
    const context = createTestContext({
        useMockClient: false,
        lspClientFactory: () => {
            const client = new FakeStartableClient();
            client.failOnStart = true;
            return client;
        },
    });

    await context.runtime.start();

    assert.equal(context.runtime.getState(), 'failed');
    assert.equal(context.indicatorTransitions.at(-1), 'error');
    assert.equal(context.attachments.at(-1), null);
});

test('ClientRuntime serializes concurrent restart requests into restart rounds', async () => {
    let startIndex = 0;
    const context = createTestContext({
        useMockClient: false,
        lspClientFactory: () => {
            const client = new FakeStartableClient();
            const currentIndex = startIndex++;
            client.start = async () => {
                client.startCalls += 1;
                if (currentIndex === 0) {
                    await Promise.resolve();
                }
            };
            return client;
        },
    });

    await context.runtime.start();
    const firstClient = context.createdLspClients[0];

    const restartOne = context.runtime.restart();
    const restartTwo = context.runtime.restart();
    await Promise.all([restartOne, restartTwo]);

    assert.equal(firstClient.stopCalls, 1);
    assert.equal(context.createdLspClients.length, 3);
    assert.equal(context.createdLspClients[1].stopCalls, 1);
    assert.equal(context.runtime.getState(), 'ready');
});

test('ClientRuntime stop is idempotent without active client', async () => {
    const context = createTestContext({ useMockClient: true });

    await context.runtime.stop();
    await context.runtime.stop();

    assert.equal(context.runtime.getState(), 'stopped');
    assert.deepEqual(context.attachments, [null, null]);
});
