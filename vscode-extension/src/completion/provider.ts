import {
    InlineCompletionItemProvider,
    InlineCompletionContext,
    InlineCompletionItem,
    InlineCompletionList,
    TextDocument,
    Position,
    CancellationToken,
    Range,
} from 'vscode';
import { LspClient } from '../lsp/client';
import { Debouncer } from './debounce';
import { ClientCache } from './cache';
import { Settings } from '../config/settings';

export class AIInlineCompletionProvider implements InlineCompletionItemProvider {
    private debouncer: Debouncer;
    private lspClient: LspClient;
    private settings: Settings;
    private clientCache: ClientCache;

    private currentStreamText = '';
    private currentStreamId = '';

    constructor(
        lspClient: LspClient,
        settings: Settings
    ) {
        this.lspClient = lspClient;
        this.settings = settings;
        this.debouncer = new Debouncer(settings.get<number>('debounceMs') ?? 150);
        this.clientCache = new ClientCache(100, 5000);

        settings.onDidChange((key, value) => {
            if (key === 'debounceMs') {
                this.debouncer.updateDelay(value as number);
            }
        });

        this.lspClient.onStreamUpdate((params) => {
            if (params.streamId === this.currentStreamId) {
                this.currentStreamText = params.text;
            }
        });
    }

    async provideInlineCompletionItems(
        document: TextDocument,
        position: Position,
        context: InlineCompletionContext,
        token: CancellationToken
    ): Promise<InlineCompletionItem[] | InlineCompletionList | undefined> {
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
            // 构建缓存 key：文档 + 位置 + 当前行内容
            const line = document.lineAt(position.line).text;
            const prefix = line.substring(0, position.character);
            const cacheKey = `${document.uri.toString()}:${position.line}:${prefix}`;

            // 检查客户端缓存
            const cached = this.clientCache.get(cacheKey);
            if (cached) {
                return [
                    new InlineCompletionItem(cached, new Range(position, position)),
                ];
            }

            // 通过 LSP 请求补全
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
                this.currentStreamId = item.streamId;
                this.currentStreamText = item.text;
            }

            // 写入客户端缓存
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
}
