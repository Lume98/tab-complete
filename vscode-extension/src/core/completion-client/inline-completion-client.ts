import type { CancellationToken, Disposable } from 'vscode';
import type {
    InlineCompletionList,
    InlineCompletionParams,
} from '@/core/lsp/protocol';

// 流式更新参数（Server 推送的单个 SSE 数据包）
export interface StreamUpdate {
    // 该流的唯一 ID，用于关联多个 token 更新
    streamId: string;
    // 新增的 token 文本
    text: string;
    // 标志流是否完成
    done: boolean;
}

// 流式更新回调类型
export type StreamUpdateCallback = (params: StreamUpdate) => void;

// 补全客户端接口：定义补全、缓存清理、流式监听的约定
export interface InlineCompletionClient {
    // 发起补全请求（支持 cancellation token）
    requestInlineCompletion(
        params: InlineCompletionParams,
        token?: CancellationToken
    ): Promise<InlineCompletionList | null>;
    // 清理 Server 端缓存
    clearCache(): Promise<void>;
    // 注册流式更新监听器
    onStreamUpdate(callback: StreamUpdateCallback): Disposable;
}

// 可启动的补全客户端：扩展了 start/stop 生命周期（LSP 模式）
export interface StartableInlineCompletionClient extends InlineCompletionClient {
    start(): Promise<void>;
    stop(): Promise<void>;
}
