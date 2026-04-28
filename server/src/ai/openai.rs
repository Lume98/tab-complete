use async_trait::async_trait;
use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

use super::streaming::{parse_openai_sse, SseParser};
use super::{AIError, AIProvider, CompletionChunk, CompletionStream};
use crate::completion::context::CompletionRequest;
use crate::completion::prompt::PromptBuilder;

pub struct OpenAIProvider {
    api_key: Option<String>,
    model: String,
    api_base: String,
    client: Client,
}

impl OpenAIProvider {
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
        self.api_key
            .clone()
            .ok_or(AIError::AuthError)
    }
}

/// OpenAI Chat Completions 请求体
#[derive(Debug, Serialize)]
struct OpenAiRequest {
    model: String,
    max_tokens: u32,
    stream: Option<bool>,
    messages: Vec<serde_json::Value>,
}

/// OpenAI Chat Completions 响应体（非流式）
#[derive(Debug, Deserialize)]
struct OpenAiResponse {
    choices: Vec<OpenAiChoice>,
    id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenAiChoice {
    message: Option<OpenAiMessage>,
    #[allow(dead_code)]
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenAiMessage {
    #[allow(dead_code)]
    role: Option<String>,
    content: Option<String>,
}

fn check_error(status: reqwest::StatusCode, body: &str) -> AIError {
    if status.as_u16() == 401 {
        return AIError::AuthError;
    }
    if status.as_u16() == 429 {
        return AIError::RateLimited;
    }
    AIError::RequestFailed(format!("HTTP {}: {}", status, &body[..body.len().min(200)]))
}

#[async_trait]
impl AIProvider for OpenAIProvider {
    async fn stream_completion(
        &self,
        request: CompletionRequest,
        max_tokens: u32,
    ) -> Result<CompletionStream, AIError> {
        let api_key = self.resolve_api_key()?;

        let body = OpenAiRequest {
            model: self.model.clone(),
            max_tokens,
            stream: Some(true),
            messages: PromptBuilder::build_openai_messages(&request),
        };

        let url = format!(
            "{}/v1/chat/completions",
            self.api_base.trim_end_matches('/')
        );
        tracing::debug!("OpenAI streaming request: {} model={}", url, self.model);

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", api_key))
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
            return Err(check_error(status, &body));
        }

        let byte_stream = response.bytes_stream();
        let (tx, rx) = tokio::sync::mpsc::channel::<Result<CompletionChunk, AIError>>(32);

        tokio::spawn(async move {
            let mut sse_parser = SseParser::new();
            let mut stream = byte_stream;

            while let Some(chunk_result) = stream.next().await {
                match chunk_result {
                    Ok(bytes) => {
                        let text = String::from_utf8_lossy(&bytes);
                        let events = sse_parser.feed(&text);

                        for (_event_type, data) in events {
                            if let Some(chunk) = parse_openai_sse(&data) {
                                if tx.send(Ok(chunk)).await.is_err() {
                                    return;
                                }
                            }
                        }
                    }
                    Err(e) => {
                        let _ = tx
                            .send(Err(AIError::RequestFailed(e.to_string())))
                            .await;
                        return;
                    }
                }
            }
        });

        let stream = tokio_stream::wrappers::ReceiverStream::new(rx);
        Ok(Box::pin(stream))
    }

    async fn complete(
        &self,
        request: CompletionRequest,
        max_tokens: u32,
    ) -> Result<Vec<CompletionChunk>, AIError> {
        let api_key = self.resolve_api_key()?;

        let body = OpenAiRequest {
            model: self.model.clone(),
            max_tokens,
            stream: None,
            messages: PromptBuilder::build_openai_messages(&request),
        };

        let url = format!(
            "{}/v1/chat/completions",
            self.api_base.trim_end_matches('/')
        );
        tracing::debug!("OpenAI request: {} model={}", url, self.model);

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", api_key))
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
            return Err(check_error(status, &response_text));
        }

        let openai_resp: OpenAiResponse = serde_json::from_str(&response_text)
            .map_err(|e| AIError::StreamParseError(format!("Parse error: {}", e)))?;

        let text = openai_resp
            .choices
            .first()
            .and_then(|c| c.message.as_ref())
            .and_then(|m| m.content.clone())
            .unwrap_or_default();

        let id = openai_resp.id.unwrap_or_default();

        Ok(vec![CompletionChunk {
            token: text,
            done: true,
            completion_id: id,
        }])
    }

    fn name(&self) -> &'static str {
        "openai"
    }
}
