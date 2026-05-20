import type { CancellationToken, Disposable } from 'vscode';
import type {
    InlineCompletionList,
    InlineCompletionParams,
} from '@/core/lsp/protocol';

export interface StreamUpdate {
    streamId: string;
    text: string;
    done: boolean;
}

export type StreamUpdateCallback = (params: StreamUpdate) => void;

export interface InlineCompletionClient {
    requestInlineCompletion(
        params: InlineCompletionParams,
        token?: CancellationToken
    ): Promise<InlineCompletionList | null>;
    clearCache(): Promise<void>;
    onStreamUpdate(callback: StreamUpdateCallback): Disposable;
}

export interface StartableInlineCompletionClient extends InlineCompletionClient {
    start(): Promise<void>;
    stop(): Promise<void>;
}
