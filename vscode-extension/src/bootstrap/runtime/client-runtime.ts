import type {
    CompletionClientRouter,
} from '@/core/completion-client/completion-client-router';
import type {
    InlineCompletionClient,
    StartableInlineCompletionClient,
} from '@/core/completion-client/inline-completion-client';
import type { Settings } from '@/core/config/settings';
import {
    createStartupConfigSnapshot,
    toStartupConfigLogObject,
} from '@/bootstrap/runtime/startup-config-snapshot';
import type { RuntimeLogSink } from '@/bootstrap/runtime/runtime-logger';

export type ClientRuntimeState =
    | 'idle'
    | 'starting'
    | 'ready'
    | 'restarting'
    | 'stopped'
    | 'failed';

export interface ClientRuntimeIndicator {
    showInitializing(): void;
    showReady(): void;
    showDisabled(): void;
    showError(message?: string): void;
}

export interface ClientRuntimeDependencies {
    settings: Pick<Settings, 'get'>;
    clientRouter: Pick<
        CompletionClientRouter,
        'attach' | 'clearCache' | 'updateStreamListenerMaxFailures'
    >;
    mockClient: InlineCompletionClient;
    indicator: ClientRuntimeIndicator;
    logger: RuntimeLogSink;
    createLspClient: () => StartableInlineCompletionClient;
    onProviderFallback?: (provider: string) => void;
    restartDelayMs?: number;
    delay?: (ms: number) => Promise<void>;
}

const DEFAULT_RESTART_DELAY_MS = 2000;

export class ClientRuntime {
    // 当前状态：idle → starting → ready (或 failed)；restart 时 restarting → ready；stop 时 stopped
    private state: ClientRuntimeState = 'idle';
    // 当前活跃的 LSP 客户端实例（mock 客户端不保留引用）
    private activeLspClient: StartableInlineCompletionClient | null = null;
    // 操作队列：保证 start/restart/stop 串行执行，避免竞态条件
    private operationChain: Promise<void> = Promise.resolve();
    // 正在进行的 restart 操作：用于合并多个 restart 请求
    private activeRestartPromise: Promise<void> | null = null;
    // restart 排队标志：activeRestartPromise 完成后再检查此标志，决定是否继续 restart 循环
    private restartQueued = false;
    private readonly restartDelayMs: number;
    private readonly delay: (ms: number) => Promise<void>;

    constructor(private readonly deps: ClientRuntimeDependencies) {
        this.restartDelayMs = deps.restartDelayMs ?? DEFAULT_RESTART_DELAY_MS;
        this.delay = deps.delay ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    }

    getState(): ClientRuntimeState {
        return this.state;
    }

    async start(): Promise<void> {
        // 排队一个启动操作，保证与 restart/stop 串行
        await this.enqueue(async () => {
            // 跳过已启动状态
            if (this.state === 'starting' || this.state === 'ready' || this.state === 'restarting') {
                this.deps.logger.log(`Start skipped in state=${this.state}`);
                return;
            }

            await this.startInternal();
        });
    }

    async restart(): Promise<void> {
        // 如果 restart 已在进行中，标记 restartQueued，待当前 restart 完成后再执行下一轮
        if (this.activeRestartPromise) {
            this.restartQueued = true;
            this.deps.logger.log('Restart already in progress; merged additional restart request');
            return this.activeRestartPromise;
        }

        const restartPromise = this.enqueue(async () => {
            // 启动 restart 循环（可能多轮）
            this.activeRestartPromise = this.runRestartLoop();
            try {
                await this.activeRestartPromise;
            } finally {
                this.activeRestartPromise = null;
            }
        });

        return restartPromise;
    }

    async stop(): Promise<void> {
        await this.enqueue(async () => {
            await this.stopInternal('stopped');
        });
    }

    private async runRestartLoop(): Promise<void> {
        // restart 循环：如果在上一轮 restart 期间有新的 restart 请求，继续再启一轮
        do {
            this.restartQueued = false;
            this.state = 'restarting';
            this.deps.logger.log(`Restart requested, waiting ${this.restartDelayMs}ms before restart`);
            this.deps.indicator.showInitializing();
            // 释放当前 LSP 客户端
            await this.releaseActiveClient();
            // 延迟后再启动，避免频繁重启
            await this.delay(this.restartDelayMs);
            await this.startInternal();
        } while (this.restartQueued);
    }

    private async startInternal(): Promise<void> {
        // 1. 加载配置快照（provider、model、useMockClient、enableAutoCompletion 等）
        const snapshot = createStartupConfigSnapshot(this.deps.settings);
        this.deps.logger.log(`Startup config: ${JSON.stringify(toStartupConfigLogObject(snapshot))}`);

        // 2. 检查 provider 是否有效（无效则回退）
        if (snapshot.fallbackApplied) {
            const warning = `Invalid provider "${String(snapshot.originalProviderValue)}", fallback to "${snapshot.provider}"`;
            this.deps.logger.warn(warning);
            this.deps.onProviderFallback?.(snapshot.provider);
        }

        this.state = 'starting';
        this.deps.indicator.showInitializing();

        // 3. useMockClient 模式：直接挂 mock 客户端，无需启动 LSP Server
        if (snapshot.useMockClient) {
            this.deps.clientRouter.attach(this.deps.mockClient);
            this.syncIndicator(snapshot.enableAutoCompletion);
            this.state = 'ready';
            this.deps.logger.log('Completion client ready: mode=mock');
            return;
        }

        // 4. LSP 模式：启动真实 LSP Server，失败则降级为无客户端
        try {
            this.deps.logger.log('Completion client mode=lsp');
            const nextClient = this.deps.createLspClient();
            await nextClient.start();
            this.activeLspClient = nextClient;
            this.deps.clientRouter.attach(nextClient);
            this.syncIndicator(snapshot.enableAutoCompletion);
            this.state = 'ready';
            this.deps.logger.log('Completion client ready: mode=lsp');
        } catch (error) {
            // LSP 启动失败：路由器降级为 null（禁用补全）
            this.deps.clientRouter.attach(null);
            this.activeLspClient = null;
            this.state = 'failed';
            this.deps.indicator.showError('LSP Server 启动失败');
            this.deps.logger.error(`Failed to start LSP server: ${this.stringifyError(error)}`);
        }
    }

    private async stopInternal(targetState: Extract<ClientRuntimeState, 'idle' | 'stopped'>): Promise<void> {
        await this.releaseActiveClient();
        this.state = targetState;
    }

    private async releaseActiveClient(): Promise<void> {
        const currentClient = this.activeLspClient;
        this.deps.clientRouter.attach(null);
        this.activeLspClient = null;

        if (!currentClient) {
            this.deps.logger.log('No active LSP client to stop');
            return;
        }

        try {
            await currentClient.stop();
        } catch (error) {
            this.deps.logger.error(`Error stopping LSP client: ${this.stringifyError(error)}`);
        }
    }

    private syncIndicator(enableAutoCompletion: boolean): void {
        if (enableAutoCompletion) {
            this.deps.indicator.showReady();
            return;
        }

        this.deps.indicator.showDisabled();
    }

    private enqueue(operation: () => Promise<void>): Promise<void> {
        // 将操作追加到队列末尾，确保与之前的操作串行执行
        // 无论之前操作成功或失败，都继续执行下一个操作
        const next = this.operationChain.then(operation, operation);
        // 吞掉错误，保证后续操作不中断
        this.operationChain = next.then(
            () => undefined,
            () => undefined
        );
        return next;
    }

    private stringifyError(error: unknown): string {
        if (error instanceof Error) {
            return error.stack ?? `${error.name}: ${error.message}`;
        }

        try {
            return JSON.stringify(error);
        } catch {
            return String(error);
        }
    }
}
