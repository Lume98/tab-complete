import {
    Disposable,
    InlineCompletionItemProvider,
    InlineCompletionContext,
    InlineCompletionItem,
    InlineCompletionList as VsCodeInlineCompletionList,
    TextDocument,
    Position,
    CancellationToken,
    Range,
    Uri,
} from 'vscode';
import { InlineCompletionClient } from '@/completion/client';
import { Debouncer } from '@/completion/debounce';
import { ClientCache } from '@/completion/cache';
import { Settings } from '@/config/settings';
import {
    resolveProviderModel,
    PROVIDER_MODEL_KEYS,
    ProviderName,
} from '@/config/provider-config';
import { buildInlineCompletionCacheKey } from '@/completion/cache-key';

class StreamTracker {
    private streamId = '';
    private text = '';

    /** 开始追踪新流 */
    track(streamId: string, text: string): void {
        this.streamId = streamId;
        this.text = text;
    }

    /** 仅当 streamId 匹配时更新文本，防止陈旧流覆盖 */
    update(streamId: string, text: string): void {
        if (streamId === this.streamId) {
            this.text = text;
        }
    }

    getText(): string {
        return this.text;
    }

    clear(): void {
        this.streamId = '';
        this.text = '';
    }
}

/**
 * VS Code inline completion provider。
 * 数据流：
 * editor request -> debounce -> client cache -> LSP/mock request -> cache/store。
 */
export class AIInlineCompletionProvider implements InlineCompletionItemProvider {
    private debouncer: Debouncer;
    private lspClient: InlineCompletionClient;
    private settings: Settings;
    private clientCache: ClientCache;
    private readonly disposables: Disposable[] = [];
    private readonly streamTracker = new StreamTracker();

    private resolvedProvider: ProviderName = 'claude';
    private resolvedModel = '';

    constructor(
        lspClient: InlineCompletionClient,
        settings: Settings
    ) {
        this.lspClient = lspClient;
        this.settings = settings;
        this.debouncer = new Debouncer(settings.get<number>('debounceMs', null) ?? 150);
        this.clientCache = new ClientCache(100, 5000);

        this.refreshResolvedProvider();

        this.disposables.push(settings.onDidChange((key, value) => {
            if (key === 'debounceMs') {
                this.debouncer.updateDelay(value as number);
            }
            if (key === 'provider' || PROVIDER_MODEL_KEYS.includes(key)) {
                this.refreshResolvedProvider();
                this.clientCache.clear();
            }
        }));

        this.disposables.push(this.lspClient.onStreamUpdate((params) => {
            this.streamTracker.update(params.streamId, params.text);
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

        return this.resolveCompletion(document, position, context, token);
    }

    getCurrentStreamText(): string {
        return this.streamTracker.getText();
    }

    clearStream(): void {
        this.streamTracker.clear();
    }

    clearCache(): void {
        this.clientCache.clear();
    }

    dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables.length = 0;
    }

    private async resolveCompletion(
        document: TextDocument,
        position: Position,
        context: InlineCompletionContext,
        token: CancellationToken
    ): Promise<InlineCompletionItem[] | undefined> {
        try {
            const line = document.lineAt(position.line).text;
            const prefix = line.substring(0, position.character);
            const cacheKey = this.buildCacheKey(document, position.line, prefix);

            const cached = this.clientCache.get(cacheKey);
            if (cached) {
                return [
                    new InlineCompletionItem(cached, new Range(position, position)),
                ];
            }

            const result = await this.lspClient.requestInlineCompletion(
                {
                    textDocument: { uri: document.uri.toString() },
                    position: { line: position.line, character: position.character },
                    context: { triggerKind: context.triggerKind },
                },
                token
            );

            if (!result?.items?.length) {
                return undefined;
            }

            const item = result.items[0];

            if (item.streamId) {
                this.streamTracker.track(item.streamId, item.text);
            }

            if (item.text) {
                this.clientCache.set(cacheKey, item.text);
            }

            return [
                new InlineCompletionItem(item.text, new Range(position, position)),
            ];
        } catch (error) {
            console.error('AI completion error:', error);
            return undefined;
        }
    }

    private refreshResolvedProvider(): void {
        const resolved = resolveProviderModel(
            this.settings.get<string>('provider', null),
            (key) => this.settings.get<string>(key, null)
        );
        this.resolvedProvider = resolved.provider;
        this.resolvedModel = resolved.model ?? '';
    }

    private buildCacheKey(document: TextDocument, line: number, prefix: string): string {
        return buildInlineCompletionCacheKey({
            documentUri: document.uri.toString(),
            documentVersion: document.version,
            line,
            prefix,
            provider: this.resolvedProvider,
            model: this.resolvedModel,
        });
    }
}
