pub mod claude;
pub mod openai;
pub mod ollama;
pub mod streaming;
pub mod retry;

use async_trait::async_trait;
use futures::Stream;
use std::pin::Pin;

use crate::completion::context::CompletionRequest;

/// 流式补全 chunk
#[derive(Debug, Clone)]
pub struct CompletionChunk {
    pub token: String,
    pub done: bool,
    pub completion_id: String,
}

/// 流式补全结果
pub type CompletionStream = Pin<Box<dyn Stream<Item = Result<CompletionChunk, AIError>> + Send>>;

/// AI Provider 错误
#[derive(Debug, thiserror::Error)]
pub enum AIError {
    #[error("API 请求失败: {0}")]
    RequestFailed(String),
    #[error("API 认证错误")]
    AuthError,
    #[error("Rate limit 命中")]
    RateLimited,
    #[error("模型返回内容被安全过滤")]
    ContentFiltered,
    #[error("超时")]
    Timeout,
    #[error("流式解析错误: {0}")]
    StreamParseError(String),
    #[error("不支持的操作")]
    Unsupported,
}

/// AI Provider 统一抽象
#[async_trait]
pub trait AIProvider: Send + Sync {
    /// 流式补全请求
    async fn stream_completion(
        &self,
        request: CompletionRequest,
        max_tokens: u32,
    ) -> Result<CompletionStream, AIError>;

    /// 非流式补全
    async fn complete(
        &self,
        request: CompletionRequest,
        max_tokens: u32,
    ) -> Result<Vec<CompletionChunk>, AIError>;

    /// Provider 名称
    fn name(&self) -> &'static str;
}

/// Provider 类型
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProviderType {
    Claude,
    OpenAI,
    Ollama,
}

/// 创建 AI Provider
pub fn create_provider(
    provider_type: ProviderType,
    api_key: Option<String>,
    model: String,
    api_base: String,
) -> Box<dyn AIProvider> {
    match provider_type {
        ProviderType::Claude => Box::new(claude::ClaudeProvider::new(api_key, model, api_base)),
        ProviderType::OpenAI => Box::new(openai::OpenAIProvider::new(api_key, model, api_base)),
        ProviderType::Ollama => Box::new(ollama::OllamaProvider::new(model, api_base)),
    }
}
