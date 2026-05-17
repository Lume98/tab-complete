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
} from 'vscode';
import { StreamUpdateCallback } from '@/lsp/client';
import {
    InlineCompletionList as LspInlineCompletionList,
    InlineCompletionParams,
} from '@/lsp/protocol';
import { Debouncer } from '@/completion/debounce';
import { ClientCache } from '@/completion/cache';
import { Settings } from '@/config/settings';
import {
    resolveProviderModel,
    PROVIDER_MODEL_KEYS,
} from '@/config/provider-config';
import { buildInlineCompletionCacheKey } from '@/completion/cache-key';

export interface InlineCompletionClient {
    requestInlineCompletion(
        params: InlineCompletionParams,
        token?: CancellationToken
    ): Promise<LspInlineCompletionList | null>;
    clearCache(): Promise<void>;
    onStreamUpdate(callback: StreamUpdateCallback): { dispose(): void };
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

    private currentStreamText = '';
    private currentStreamId = '';

    constructor(
        lspClient: InlineCompletionClient,
        settings: Settings
    ) {
        this.lspClient = lspClient;
        this.settings = settings;
        this.debouncer = new Debouncer(settings.get<number>('debounceMs') ?? 150);
        this.clientCache = new ClientCache(100, 5000);

        this.disposables.push(settings.onDidChange((key, value) => {
            if (key === 'debounceMs') {
                this.debouncer.updateDelay(value as number);
            }
            if (
                key === 'provider' ||
                PROVIDER_MODEL_KEYS.includes(key)
            ) {
                this.clientCache.clear();
            }
        }));

        this.disposables.push(this.lspClient.onStreamUpdate((params) => {
            // 仅接收当前追踪流的更新。
            // 避免陈旧流文本覆盖更新请求的结果。
            if (params.streamId === this.currentStreamId) {
                this.currentStreamText = params.text;
            }
        }));
    }

    async provideInlineCompletionItems(
        document: TextDocument,
        position: Position,
        context: InlineCompletionContext,
        token: CancellationToken
    ): Promise<InlineCompletionItem[] | VsCodeInlineCompletionList | undefined> {
        if (!this.settings.get<boolean>('enableAutoCompletion')) {
            return undefined;
        }

        if (token.isCancellationRequested) {
            return undefined;
        }

        const shouldContinue = await this.debouncer.wait(token);
        if (!shouldContinue) {
            return undefined;
        }

        try {
            // 缓存键有意只包含当前行前缀：
            // 在同一光标位置快速输入时足够快、开销低且稳定。
            // 耦合风险：TTL 期间会忽略当前行之外的编辑。
            const line = document.lineAt(position.line).text;
            const prefix = line.substring(0, position.character);
            const cacheKey = this.buildCacheKey(document, position.line, prefix);

            // 客户端短 TTL 缓存可避免重复 LSP 往返。
            const cached = this.clientCache.get(cacheKey);
            if (cached) {
                return [
                    new InlineCompletionItem(cached, new Range(position, position)),
                ];
            }

            // 通过路由客户端向后端请求补全。
            const result = await this.lspClient.requestInlineCompletion(
                {
                    textDocument: { uri: document.uri.toString() },
                    position: { line: position.line, character: position.character },
                    context: { triggerKind: context.triggerKind },
                },
                token
            );

            if (!result || !result.items || result.items.length === 0) {
                return undefined;
            }

            const item = result.items[0];

            if (item.streamId) {
                // 流式模式：保留最新流 token 供外部 UI 轮询。
                this.currentStreamId = item.streamId;
                this.currentStreamText = item.text;
            }

            // 仅缓存非空文本，避免把空失败结果固定住。
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

    getCurrentStreamText(): string {
        return this.currentStreamText;
    }

    clearStream(): void {
        this.currentStreamText = '';
        this.currentStreamId = '';
    }

    clearCache(): void {
        this.clientCache.clear();
    }

    private buildCacheKey(document: TextDocument, line: number, prefix: string): string {
        const resolved = resolveProviderModel(
            this.settings.get<string>('provider'),
            (key) => this.settings.get<string>(key)
        );
        return buildInlineCompletionCacheKey({
            documentUri: document.uri.toString(),
            documentVersion: document.version,
            line,
            prefix,
            provider: resolved.provider,
            model: resolved.model ?? '',
        });
    }

    dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables.length = 0;
    }
}
