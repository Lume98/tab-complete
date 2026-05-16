/** VS Code 侧 LSP 协议类型定义，与 rust server/src/protocol.rs 保持一致 */

// `textDocument/inlineCompletion` 的请求负载。
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

// `textDocument/inlineCompletion` 的响应负载。
export interface InlineCompletionList {
    items: InlineCompletionItem[];
}

export interface InlineCompletionItem {
    text: string;
    // 当服务端会继续为该项推送流式更新时存在。
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
