export interface InlineCompletionParams {
    textDocument: {
        uri: string;
    };
    position: {
        line: number;
        character: number;
    };
    context: {
        triggerKind: number;
    };
}

export interface InlineCompletionList {
    items: InlineCompletionItem[];
}

export interface InlineCompletionItem {
    text: string;
    streamId?: string;
}

export interface InlineCompletionAcceptedParams {
    completionId: string;
    acceptedLength: number;
    latencyMs: number;
}

export interface InlineCompletionDismissedParams {
    completionId: string;
    visibleDurationMs: number;
}
