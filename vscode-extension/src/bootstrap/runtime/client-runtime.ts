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
    private state: ClientRuntimeState = 'idle';
    private activeLspClient: StartableInlineCompletionClient | null = null;
    private operationChain: Promise<void> = Promise.resolve();
    private activeRestartPromise: Promise<void> | null = null;
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
        await this.enqueue(async () => {
            if (this.state === 'starting' || this.state === 'ready' || this.state === 'restarting') {
                this.deps.logger.log(`Start skipped in state=${this.state}`);
                return;
            }

            await this.startInternal();
        });
    }

    async restart(): Promise<void> {
        if (this.activeRestartPromise) {
            this.restartQueued = true;
            this.deps.logger.log('Restart already in progress; merged additional restart request');
            return this.activeRestartPromise;
        }

        const restartPromise = this.enqueue(async () => {
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
        do {
            this.restartQueued = false;
            this.state = 'restarting';
            this.deps.logger.log(`Restart requested, waiting ${this.restartDelayMs}ms before restart`);
            this.deps.indicator.showInitializing();
            await this.releaseActiveClient();
            await this.delay(this.restartDelayMs);
            await this.startInternal();
        } while (this.restartQueued);
    }

    private async startInternal(): Promise<void> {
        const snapshot = createStartupConfigSnapshot(this.deps.settings);
        this.deps.logger.log(`Startup config: ${JSON.stringify(toStartupConfigLogObject(snapshot))}`);

        if (snapshot.fallbackApplied) {
            const warning = `Invalid provider "${String(snapshot.originalProviderValue)}", fallback to "${snapshot.provider}"`;
            this.deps.logger.warn(warning);
            this.deps.onProviderFallback?.(snapshot.provider);
        }

        this.state = 'starting';
        this.deps.indicator.showInitializing();

        if (snapshot.useMockClient) {
            this.deps.clientRouter.attach(this.deps.mockClient);
            this.syncIndicator(snapshot.enableAutoCompletion);
            this.state = 'ready';
            this.deps.logger.log('Completion client ready: mode=mock');
            return;
        }

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
        const next = this.operationChain.then(operation, operation);
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
