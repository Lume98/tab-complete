import { CancellationToken } from 'vscode';
import { StreamUpdateCallback } from '@/lsp/client';
import {
    InlineCompletionList,
    InlineCompletionParams,
} from '@/lsp/protocol';

export interface InlineCompletionClient {
    requestInlineCompletion(
        params: InlineCompletionParams,
        token?: CancellationToken
    ): Promise<InlineCompletionList | null>;
    clearCache(): Promise<void>;
    onStreamUpdate(callback: StreamUpdateCallback): { dispose(): void };
}
