use serde::{Deserialize, Serialize};
use tower_lsp::lsp_types::notification::Notification;
use tower_lsp::lsp_types::{Position, TextDocumentIdentifier};

/// 自定义请求: 内联补全
/// 方法名: "textDocument/inlineCompletion"
#[derive(Debug, Deserialize, Serialize)]
pub struct InlineCompletionParams {
    pub text_document: TextDocumentIdentifier,
    pub position: Position,
    pub context: InlineCompletionContext,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct InlineCompletionContext {
    pub trigger_kind: CompletionTriggerKind,
}

#[derive(Debug, Deserialize, Serialize)]
pub enum CompletionTriggerKind {
    /// 用户打字触发
    Typing,
    /// 手动调用
    Invoked,
    /// 不确定
    Unknown,
}

impl Default for CompletionTriggerKind {
    fn default() -> Self {
        Self::Unknown
    }
}

/// 内联补全响应
#[derive(Debug, Serialize, Deserialize)]
pub struct InlineCompletionList {
    pub items: Vec<InlineCompletionItem>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InlineCompletionItem {
    /// 补全文本
    pub text: String,
    /// 流式 ID（如果启用流式输出）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream_id: Option<String>,
}

/// 流式补全 chunk
#[derive(Debug, Serialize, Deserialize)]
pub struct CompletionChunk {
    pub token: String,
    pub done: bool,
    pub completion_id: String,
}

/// 通知: 流式补全更新
/// 方法名: "custom/inlineCompletionUpdate"
#[derive(Debug, Serialize, Deserialize)]
pub struct InlineCompletionUpdateParams {
    /// 流式 ID
    pub stream_id: String,
    /// 累积的补全文本（到当前为止的全部文本）
    pub text: String,
    /// 是否完成
    pub done: bool,
}

/// 通知: 用户接受了补全（telemetry）
/// 方法名: "textDocument/inlineCompletionAccepted"
#[derive(Debug, Deserialize, Serialize)]
pub struct InlineCompletionAcceptedParams {
    pub completion_id: String,
    pub accepted_length: usize,
    pub latency_ms: u64,
}

/// 通知: 用户取消了补全（telemetry）
/// 方法名: "textDocument/inlineCompletionDismissed"
#[derive(Debug, Deserialize, Serialize)]
pub struct InlineCompletionDismissedParams {
    pub completion_id: String,
    pub visible_duration_ms: u64,
}

// ============================================================
// 自定义 LSP 通知类型（实现 tower-lsp Notification trait）
// ============================================================

/// 流式补全更新通知
pub struct InlineCompletionUpdate;

impl Notification for InlineCompletionUpdate {
    type Params = InlineCompletionUpdateParams;
    const METHOD: &'static str = "custom/inlineCompletionUpdate";
}
