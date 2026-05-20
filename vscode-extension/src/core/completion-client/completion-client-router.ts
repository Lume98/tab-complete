import type { CancellationToken, Disposable } from 'vscode';
import type {
    InlineCompletionList,
    InlineCompletionParams,
} from '@/core/lsp/protocol';
import type {
    InlineCompletionClient,
    StreamUpdateCallback,
} from '@/core/completion-client/inline-completion-client';

export interface CompletionClientRouterOptions {
    streamListenerMaxFailures?: number;
    logger?: Pick<Console, 'error' | 'warn'>;
}

export class CompletionClientRouter implements InlineCompletionClient, Disposable {
    private static readonly DEFAULT_MAX_LISTENER_FAILURES = 3;
    private static readonly MIN_MAX_LISTENER_FAILURES = 1;

    private activeClient: InlineCompletionClient | null = null;
    private streamSubscription: Disposable | null = null;
    private readonly streamListeners = new Set<StreamUpdateCallback>();
    private readonly listenerFailureCounts = new Map<StreamUpdateCallback, number>();
    private maxListenerFailures: number;
    private readonly logger: Pick<Console, 'error' | 'warn'>;

    constructor(options?: CompletionClientRouterOptions) {
        this.maxListenerFailures = this.normalizeMaxFailures(options?.streamListenerMaxFailures);
        this.logger = options?.logger ?? console;
    }

    updateStreamListenerMaxFailures(value: number | undefined): void {
        this.maxListenerFailures = this.normalizeMaxFailures(value);
        this.listenerFailureCounts.clear();
        this.streamListeners.forEach((listener) => {
            this.listenerFailureCounts.set(listener, 0);
        });
    }

    attach(client: InlineCompletionClient | null): void {
        this.detachStreamSubscription();
        this.activeClient = client;

        if (!client) {
            return;
        }

        this.streamSubscription = client.onStreamUpdate((params) => {
            this.broadcastStreamUpdate(params);
        });
    }

    async requestInlineCompletion(
        params: InlineCompletionParams,
        token?: CancellationToken
    ): Promise<InlineCompletionList | null> {
        return this.activeClient?.requestInlineCompletion(params, token) ?? null;
    }

    async clearCache(): Promise<void> {
        await this.activeClient?.clearCache();
    }

    onStreamUpdate(callback: StreamUpdateCallback): Disposable {
        this.streamListeners.add(callback);
        this.listenerFailureCounts.set(callback, 0);
        return {
            dispose: () => {
                this.streamListeners.delete(callback);
                this.listenerFailureCounts.delete(callback);
            },
        };
    }

    dispose(): void {
        this.detachStreamSubscription();
        this.streamListeners.clear();
        this.listenerFailureCounts.clear();
        this.activeClient = null;
    }

    private broadcastStreamUpdate(params: Parameters<StreamUpdateCallback>[0]): void {
        this.streamListeners.forEach((listener) => {
            try {
                listener(params);
                this.listenerFailureCounts.set(listener, 0);
            } catch (error) {
                const nextFailures = (this.listenerFailureCounts.get(listener) ?? 0) + 1;
                this.listenerFailureCounts.set(listener, nextFailures);

                this.logger.error('CompletionClientRouter stream listener error:', error);

                if (nextFailures >= this.maxListenerFailures) {
                    this.streamListeners.delete(listener);
                    this.listenerFailureCounts.delete(listener);
                    this.logger.warn(
                        `CompletionClientRouter removed unstable stream listener after ${nextFailures} consecutive errors`
                    );
                }
            }
        });
    }

    private detachStreamSubscription(): void {
        this.streamSubscription?.dispose();
        this.streamSubscription = null;
    }

    private normalizeMaxFailures(configured: number | undefined): number {
        const fallback = CompletionClientRouter.DEFAULT_MAX_LISTENER_FAILURES;
        const parsed = typeof configured === 'number' && Number.isFinite(configured)
            ? Math.floor(configured)
            : fallback;
        return Math.max(CompletionClientRouter.MIN_MAX_LISTENER_FAILURES, parsed);
    }
}
