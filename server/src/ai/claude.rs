use async_trait::async_trait;
use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

use super::streaming::{claude_event_to_chunk, parse_claude_sse, SseParser};
use super::{AIError, AIProvider, CompletionChunk, CompletionStream};
use crate::completion::context::CompletionRequest;
use crate::completion::prompt::PromptBuilder;

/// Claude API Provider — 封装 Anthropic Messages API
///
/// 支持两种模式：
/// - 流式：POST /v1/messages (stream=true)，SSE 逐 token 返回
/// - 非流式：POST /v1/messages，一次性返回完整响应
pub struct ClaudeProvider {
    api_key: Option<String>,
    model: String,
    api_base: String,
    client: Client,
}

impl ClaudeProvider {
    pub fn new(api_key: Option<String>, model: String, api_base: String) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .unwrap_or_else(|_| Client::new());
        Self {
            api_key,
            model,
            api_base,
            client,
        }
    }

    fn resolve_api_key(&self) -> Result<String, AIError> {
        // api_key 已由 config 层解析（配置文件 > 环境变量），这里直接用
        self.api_key
            .clone()
            .ok_or(AIError::AuthError)
    }
}

/// Claude Messages API 请求体
#[derive(Debug, Serialize)]
struct ClaudeRequest {
    model: String,
    max_tokens: u32,
    stream: Option<bool>,
    system: String,
    messages: Vec<ClaudeMessage>,
}

#[derive(Debug, Serialize)]
struct ClaudeMessage {
    role: String,
    content: String,
}

/// Claude Messages API 响应体（非流式）
#[derive(Debug, Deserialize)]
struct ClaudeResponse {
    content: Vec<ClaudeContentBlock>,
    #[allow(dead_code)]
    stop_reason: Option<String>,
    id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ClaudeContentBlock {
    #[serde(rename = "type")]
    content_type: String,
    text: Option<String>,
}

/// Claude API 错误响应
#[derive(Debug, Deserialize)]
struct ClaudeError {
    error: Option<ClaudeErrorDetail>,
}

#[derive(Debug, Deserialize)]
struct ClaudeErrorDetail {
    #[serde(rename = "type")]
    error_type: Option<String>,
    message: Option<String>,
}

fn build_request_body(request: &CompletionRequest, max_tokens: u32, stream: bool) -> ClaudeRequest {
    // 使用 PromptBuilder 构造 user prompt，system prompt 直接内嵌
    let user_prompt = PromptBuilder::build_claude_prompt(request);
    let system_prompt = "你是一个优秀的代码自动补全助手。请根据上下文完成光标位置后的代码。只输出补全内容，不要任何解释。确保补全的代码风格与上下文一致。";

    ClaudeRequest {
        model: request.language.clone(), // placeholder, overwritten below
        max_tokens,
        stream: if stream { Some(true) } else { None },
        system: system_prompt.to_string(),
        messages: vec![ClaudeMessage {
            role: "user".to_string(),
            content: user_prompt,
        }],
    }
}

/// 根据 HTTP 状态码和响应体映射为 AIError
fn check_api_error(status: reqwest::StatusCode, body: &str) -> AIError {
    if status.as_u16() == 401 {
        return AIError::AuthError;
    }
    if status.as_u16() == 429 {
        return AIError::RateLimited;
    }
    if let Ok(err) = serde_json::from_str::<ClaudeError>(body) {
        if let Some(detail) = err.error {
            match detail.error_type.as_deref() {
                Some("overloaded_error") => return AIError::RateLimited,
                _ => return AIError::RequestFailed(detail.message.unwrap_or_default()),
            }
        }
    }
    AIError::RequestFailed(format!("HTTP {}: {}", status, &body[..body.len().min(200)]))
}

#[async_trait]
impl AIProvider for ClaudeProvider {
    async fn stream_completion(
        &self,
        request: CompletionRequest,
        max_tokens: u32,
    ) -> Result<CompletionStream, AIError> {
        let api_key = self.resolve_api_key()?;

        let mut body = build_request_body(&request, max_tokens, true);
        body.model = self.model.clone();

        let url = format!("{}/v1/messages", self.api_base.trim_end_matches('/'));
        tracing::debug!("Claude streaming request: {} model={}", url, self.model);

        // 发送 HTTP POST，开启 SSE 流式响应
        let response = self
            .client
            .post(&url)
            .header("x-api-key", &api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    AIError::Timeout
                } else {
                    AIError::RequestFailed(e.to_string())
                }
            })?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            tracing::warn!("Claude API error: status={} body={}", status, body);
            return Err(check_api_error(status, &body));
        }

        // 将 HTTP 字节流通过 mpsc channel 转换为 CompletionChunk Stream
        // 后台 tokio 任务负责 SSE 解析，主流程返回 Stream 给调用方
        let byte_stream = response.bytes_stream();
        let (tx, rx) = tokio::sync::mpsc::channel::<Result<CompletionChunk, AIError>>(32);

        // 后台任务：逐块读取 HTTP 响应，用 SseParser 解析 SSE 事件，转为 CompletionChunk 发送
        tokio::spawn(async move {
            use futures::StreamExt;
            let mut sse_parser = SseParser::new();
            let mut message_id = String::new();

            let mut stream = byte_stream;
            while let Some(chunk_result) = stream.next().await {
                match chunk_result {
                    Ok(bytes) => {
                        let text = String::from_utf8_lossy(&bytes);
                        let events = sse_parser.feed(&text);

                        for (event_type, data) in events {
                            // 追踪 message_id
                            if event_type == "message_start" {
                                if let Some(id) = serde_json::from_str::<serde_json::Value>(&data)
                                    .ok()
                                    .and_then(|v| v.get("message").and_then(|m| m.get("id")).and_then(|id| id.as_str()).map(|s| s.to_string()))
                                {
                                    message_id = id;
                                }
                                continue;
                            }

                            // 错误处理
                            if event_type == "error" {
                                let msg = serde_json::from_str::<serde_json::Value>(&data)
                                    .ok()
                                    .and_then(|v| v.get("error").and_then(|e| e.get("message")).and_then(|m| m.as_str()).map(|s| s.to_string()))
                                    .unwrap_or_else(|| data.clone());
                                let _ = tx.send(Err(AIError::StreamParseError(msg))).await;
                                return;
                            }

                            if let Some(sse_event) = parse_claude_sse(&event_type, &data) {
                                if let Some(chunk) = claude_event_to_chunk(&sse_event, &message_id) {
                                    if tx.send(Ok(chunk)).await.is_err() {
                                        return; // 接收端已关闭
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        let _ = tx.send(Err(AIError::RequestFailed(e.to_string()))).await;
                        return;
                    }
                }
            }
        });

        // 将 mpsc Receiver 转换为 Stream
        let stream = tokio_stream::wrappers::ReceiverStream::new(rx);
        let boxed: CompletionStream = Box::pin(stream);
        Ok(boxed)
    }

    async fn complete(
        &self,
        request: CompletionRequest,
        max_tokens: u32,
    ) -> Result<Vec<CompletionChunk>, AIError> {
        let api_key = self.resolve_api_key()?;

        let mut body = build_request_body(&request, max_tokens, false);
        body.model = self.model.clone();

        let url = format!("{}/v1/messages", self.api_base.trim_end_matches('/'));
        tracing::debug!("Claude API request: {} model={}", url, self.model);

        // 发送非流式请求，等待完整响应
        let response = self
            .client
            .post(&url)
            .header("x-api-key", &api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    AIError::Timeout
                } else {
                    AIError::RequestFailed(e.to_string())
                }
            })?;

        let status = response.status();
        let response_text = response
            .text()
            .await
            .map_err(|e| AIError::RequestFailed(e.to_string()))?;

        if !status.is_success() {
            tracing::warn!("Claude API error: status={} body={}", status, response_text);
            return Err(check_api_error(status, &response_text));
        }

        let claude_resp: ClaudeResponse = serde_json::from_str(&response_text)
            .map_err(|e| AIError::StreamParseError(format!("Failed to parse response: {}", e)))?;

        // 从响应中提取 text 类型的 content block，拼接为完整补全文本
        let text = claude_resp
            .content
            .iter()
            .filter_map(|block| {
                if block.content_type == "text" {
                    block.text.clone()
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
            .join("");

        let completion_id = claude_resp.id.unwrap_or_default();

        Ok(vec![CompletionChunk {
            token: text,
            done: true,
            completion_id,
        }])
    }

    fn name(&self) -> &'static str {
        "claude"
    }
}
