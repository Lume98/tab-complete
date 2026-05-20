import { buildInlineCompletionCacheKey } from '@/completion/cache-key';
import { InlineCompletionParams } from '@/core/lsp/protocol';
import { ProviderName } from '@/core/config/provider-config';

export interface InlineCompletionRequestInput {
    documentUri: string;
    documentVersion: number;
    line: number;
    character: number;
    lineText: string;
    triggerKind: number;
    provider: ProviderName;
    model: string;
}

export interface InlineCompletionRequestSnapshot {
    cacheKey: string;
    params: InlineCompletionParams;
    prefix: string;
    character: number;
}

export class InlineCompletionRequestBuilder {
    build(input: InlineCompletionRequestInput): InlineCompletionRequestSnapshot {
        const character = Math.max(0, Math.min(input.character, input.lineText.length));
        const prefix = input.lineText.substring(0, character);

        return {
            cacheKey: buildInlineCompletionCacheKey({
                documentUri: input.documentUri,
                documentVersion: input.documentVersion,
                line: input.line,
                prefix,
                provider: input.provider,
                model: input.model,
            }),
            params: {
                textDocument: { uri: input.documentUri },
                position: { line: input.line, character },
                context: { triggerKind: input.triggerKind },
            },
            prefix,
            character,
        };
    }
}
