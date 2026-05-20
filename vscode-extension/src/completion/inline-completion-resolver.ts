import {
    CancellationToken,
    InlineCompletionContext,
    InlineCompletionItem,
    Position,
    Range,
    TextDocument,
} from 'vscode';
import { ClientCache } from '@/completion/cache';
import { InlineCompletionRequestBuilder } from '@/completion/inline-completion-request-builder';
import { InlineCompletionClient } from '@/core/completion-client/inline-completion-client';
import { ProviderModelState } from '@/completion/provider-model-state';
import { StreamTracker } from '@/completion/stream-tracker';

export class InlineCompletionResolver {
    // 请求构建器：包括 prefix/suffix 收集、缓存 key 计算等
    private readonly requestBuilder = new InlineCompletionRequestBuilder();

    constructor(
        // 补全客户端（LSP 或 mock）
        private readonly client: InlineCompletionClient,
        // 客户端缓存
        private readonly cache: ClientCache,
        // 流式状态追踪
        private readonly streamTracker: StreamTracker,
        // provider/model 状态
        private readonly providerModelState: ProviderModelState
    ) {}

    clearCache(): void {
        this.cache.clear();
    }

    async resolve(
        document: TextDocument,
        position: Position,
        context: InlineCompletionContext,
        token: CancellationToken
    ): Promise<InlineCompletionItem[] | undefined> {
        // 1. 基础检查
        if (token.isCancellationRequested || !this.isValidLine(document, position.line)) {
            return undefined;
        }

        try {
            // 2. 构建补全请求（包括当前行前后上下文、prefix/suffix 等）
            const line = document.lineAt(position.line).text;
            const request = this.requestBuilder.build({
                documentUri: document.uri.toString(),
                documentVersion: document.version,
                line: position.line,
                character: position.character,
                lineText: line,
                triggerKind: context.triggerKind,
                provider: this.providerModelState.getProvider(),
                model: this.providerModelState.getModel(),
            });
            const requestPosition = new Position(position.line, request.character);

            // 3. 检查是否有活跃流式补全
            if (this.streamTracker.hasActiveRequest(request.cacheKey)) {
                const streamText = this.streamTracker.getText();
                if (streamText) {
                    // 流式未完成，返回当前累积文本
                    // 流式完成，缓存结果并清空状态，下次请求 hit 缓存
                    if (this.streamTracker.isDone()) {
                        this.cache.set(request.cacheKey, streamText);
                        this.streamTracker.clear();
                    }

                    return [new InlineCompletionItem(streamText, new Range(requestPosition, requestPosition))];
                }
            }

            // 4. 检查客户端缓存（命中率目标 > 60%）
            const cached = this.cache.get(request.cacheKey);
            if (cached) {
                return [new InlineCompletionItem(cached, new Range(requestPosition, requestPosition))];
            }

            // 5. 缓存未命中，发起 LSP 请求
            const result = await this.client.requestInlineCompletion(request.params, token);

            if (token.isCancellationRequested || !result?.items?.length) {
                return undefined;
            }

            const item = result.items[0];
            if (!item.text) {
                return undefined;
            }

            // 6. 缓存处理：流式还是非流式
            if (item.streamId) {
                // 流式补全：注册状态追踪，等待 Server 推送更新
                this.streamTracker.track(item.streamId, request.cacheKey, item.text);
            } else {
                // 非流式补全：直接缓存
                this.cache.set(request.cacheKey, item.text);
            }

            return [new InlineCompletionItem(item.text, new Range(requestPosition, requestPosition))];
        } catch (error) {
            console.error('AI completion error:', error);
            return undefined;
        }
    }

    private isValidLine(document: TextDocument, line: number): boolean {
        return line >= 0 && line < document.lineCount;
    }
}
