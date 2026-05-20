import {
    Disposable,
    InlineCompletionItemProvider,
    InlineCompletionContext,
    InlineCompletionItem,
    InlineCompletionList as VsCodeInlineCompletionList,
    TextDocument,
    Position,
    CancellationToken,
    commands,
} from 'vscode';
import { InlineCompletionClient } from '@/core/completion-client/inline-completion-client';
import { Debouncer } from '@/completion/debounce';
import { ClientCache } from '@/completion/cache';
import type { Settings } from '@/core/config/settings';
import {
    PROVIDER_MODEL_KEYS,
} from '@/core/config/provider-config';
import { InlineCompletionResolver } from '@/completion/inline-completion-resolver';
import { ProviderModelState } from '@/completion/provider-model-state';
import { StreamTracker } from '@/completion/stream-tracker';

/**
 * VS Code inline completion provider。
 * 数据流：
 * editor request -> debounce -> client cache -> LSP/mock request -> cache/store。
 */
export class AIInlineCompletionProvider implements InlineCompletionItemProvider {
    private debouncer: Debouncer;
    private lspClient: InlineCompletionClient;
    private settings: Pick<Settings, 'get' | 'onDidChange'>;
    private clientCache: ClientCache;
    private readonly disposables: Disposable[] = [];
    private readonly providerModelState = new ProviderModelState();
    private readonly streamTracker = new StreamTracker();
    private readonly resolver: InlineCompletionResolver;

    constructor(
        lspClient: InlineCompletionClient,
        settings: Pick<Settings, 'get' | 'onDidChange'>,
        private readonly triggerInlineSuggest: () => void = () => {
            void commands.executeCommand('editor.action.inlineSuggest.trigger');
        }
    ) {
        this.lspClient = lspClient;
        this.settings = settings;
        this.debouncer = new Debouncer(settings.get<number>('debounceMs', null) ?? 150);
        this.clientCache = new ClientCache(100, 5000);
        this.resolver = new InlineCompletionResolver(
            this.lspClient,
            this.clientCache,
            this.streamTracker,
            this.providerModelState
        );

        this.refreshResolvedProvider();

        this.disposables.push(settings.onDidChange((key, value) => {
            if (key === 'debounceMs') {
                this.debouncer.updateDelay(value as number);
            }
            if (key === 'provider' || PROVIDER_MODEL_KEYS.includes(key)) {
                if (this.refreshResolvedProvider()) {
                    this.resolver.clearCache();
                }
            }
        }));

        this.disposables.push(this.lspClient.onStreamUpdate((params) => {
            if (this.streamTracker.update(params.streamId, params.text, params.done)) {
                this.triggerInlineSuggest();
            }
        }));
    }

    async provideInlineCompletionItems(
        document: TextDocument,
        position: Position,
        context: InlineCompletionContext,
        token: CancellationToken
    ): Promise<InlineCompletionItem[] | VsCodeInlineCompletionList | undefined> {
        this.debouncer.updateDelay(this.settings.get<number>('debounceMs', document.uri) ?? 150);

        if (!this.settings.get<boolean>('enableAutoCompletion', document.uri)) {
            return undefined;
        }

        if (token.isCancellationRequested) {
            return undefined;
        }

        const shouldContinue = await this.debouncer.wait(token);
        if (!shouldContinue) {
            return undefined;
        }

        return this.resolver.resolve(document, position, context, token);
    }

    getCurrentStreamText(): string {
        return this.streamTracker.getText();
    }

    clearStream(): void {
        this.streamTracker.clear();
    }

    clearCache(): void {
        this.resolver.clearCache();
    }

    dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables.length = 0;
    }

    private refreshResolvedProvider(): boolean {
        return this.providerModelState.refresh(
            this.settings.get<string>('provider', null),
            (key) => this.settings.get<string>(key, null)
        );
    }
}
