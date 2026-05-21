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

/**
 * 在 InlineCompletionClient 实现（LSP / mock）与 Provider 端监听器之间充当路由层，
 * 使两侧可以独立替换而无需互相持有引用。
 * 通过 attach() 切换底层客户端时，流式订阅会自动迁移，已注册的监听器无感知。
 */
export class CompletionClientRouter implements InlineCompletionClient, Disposable {
    private static readonly DEFAULT_MAX_LISTENER_FAILURES = 3;
    private static readonly MIN_MAX_LISTENER_FAILURES = 1;

    // 当前活跃的补全客户端（mock 或 LSP）
    private activeClient: InlineCompletionClient | null = null;
    // 当前客户端的流式更新订阅（切换客户端时自动解除）
    private streamSubscription: Disposable | null = null;
    // 流式监听器集合：Provider 端注册的回调，接收 Server 推送的 SSE 更新
    private readonly streamListeners = new Set<StreamUpdateCallback>();
    // 流式监听器失败计数：连续失败超过阈值后自动移除
    private readonly listenerFailureCounts = new Map<StreamUpdateCallback, number>();
    // 当前最大失败次数阈值（可热更新）
    private maxListenerFailures: number;
    private readonly logger: Pick<Console, 'error' | 'warn'>;

    constructor(options?: CompletionClientRouterOptions) {
        this.maxListenerFailures = this.normalizeMaxFailures(options?.streamListenerMaxFailures);
        this.logger = options?.logger ?? console;
    }

    /**
     * 热更新最大失败次数阈值。
     * 同时重置所有监听器的计数，避免旧统计值在新阈值下立即触发移除。
     */
    updateStreamListenerMaxFailures(value: number | undefined): void {
        this.maxListenerFailures = this.normalizeMaxFailures(value);
        this.listenerFailureCounts.clear();
        this.streamListeners.forEach((listener) => {
            this.listenerFailureCounts.set(listener, 0);
        });
    }

    /**
     * 切换底层客户端。
     * 先解除旧订阅再建立新订阅，确保过渡期间不会丢失或重复推送流式更新。
     * 传入 null 相当于断开客户端，此后请求一律返回 null，流式更新静默。
     */
    attach(client: InlineCompletionClient | null): void {
        // 1. 解除旧客户端的流式订阅
        this.detachStreamSubscription();
        this.activeClient = client;

        if (!client) {
            return;
        }

        // 2. 订阅新客户端的流式更新，广播给所有 Provider 端监听器
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
        // Provider 端注册流式监听器，接收 Server 推送的 SSE 更新
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

    /**
     * 单个监听器抛出异常时不中断整个广播循环；
     * 连续失败达到阈值后移除该监听器，防止一个劣质回调拖慢所有后续推送。
     */
    private broadcastStreamUpdate(params: Parameters<StreamUpdateCallback>[0]): void {
        // 广播 Server SSE 更新给所有 Provider 端监听器
        this.streamListeners.forEach((listener) => {
            try {
                listener(params);
                // 监听器执行成功，重置失败计数
                this.listenerFailureCounts.set(listener, 0);
            } catch (error) {
                // 监听器执行失败，计数 +1
                const nextFailures = (this.listenerFailureCounts.get(listener) ?? 0) + 1;
                this.listenerFailureCounts.set(listener, nextFailures);

                this.logger.error('CompletionClientRouter stream listener error:', error);

                // 连续失败超过阈值，移除不稳定监听器（避免堵塞后续广播）
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

    /** 非法或缺省值统一回退到默认值，并保证最小值为 1（阈值为 0 会导致新注册监听器立即被移除）。 */
    private normalizeMaxFailures(configured: number | undefined): number {
        const fallback = CompletionClientRouter.DEFAULT_MAX_LISTENER_FAILURES;
        const parsed = typeof configured === 'number' && Number.isFinite(configured)
            ? Math.floor(configured)
            : fallback;
        return Math.max(CompletionClientRouter.MIN_MAX_LISTENER_FAILURES, parsed);
    }
}
