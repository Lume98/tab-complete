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
import { InlineCompletionClient } from '@/completion/client';
import { ProviderModelState } from '@/completion/provider-model-state';
import { StreamTracker } from '@/completion/stream-tracker';

export class InlineCompletionResolver {
    private readonly requestBuilder = new InlineCompletionRequestBuilder();

    constructor(
        private readonly client: InlineCompletionClient,
        private readonly cache: ClientCache,
        private readonly streamTracker: StreamTracker,
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
        if (token.isCancellationRequested || !this.isValidLine(document, position.line)) {
            return undefined;
        }

        try {
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

            const cached = this.cache.get(request.cacheKey);
            if (cached) {
                return [new InlineCompletionItem(cached, new Range(requestPosition, requestPosition))];
            }

            const result = await this.client.requestInlineCompletion(request.params, token);

            if (token.isCancellationRequested || !result?.items?.length) {
                return undefined;
            }

            const item = result.items[0];
            if (!item.text) {
                return undefined;
            }

            if (item.streamId) {
                this.streamTracker.track(item.streamId, item.text);
            }

            this.cache.set(request.cacheKey, item.text);
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
