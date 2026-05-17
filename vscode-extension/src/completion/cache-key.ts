import { ProviderName } from '@/config/provider-config';

export interface InlineCompletionCacheKeyParts {
    documentUri: string;
    documentVersion: number;
    line: number;
    prefix: string;
    provider: ProviderName;
    model: string;
}

export function buildInlineCompletionCacheKey(parts: InlineCompletionCacheKeyParts): string {
    return [
        parts.documentUri,
        parts.documentVersion,
        parts.line,
        parts.prefix,
        parts.provider,
        parts.model,
    ].join(':');
}
