use async_trait::async_trait;
use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

use super::{AIError, AIProvider, CompletionChunk, CompletionStream};
use crate::completion::context::CompletionRequest;
use crate::completion::prompt::PromptBuilder;

/// Ollama API Provider — 封装 Ollama /api/generate 接口
///
/// 支持 FIM (Fill-in-the-Middle) 格式通过 <PRE>/<SUF>/<MID> 标记
/// 支持流式（每行一个 JSON）和非流式（多行 JSON 拼接）
pub struct OllamaProvider {
    model: String,
    api_base: String,
    client: Client,
}

impl OllamaProvider {
    /// 创建 Ollama Provider（注意 60s 超时，本地模型推理可能较慢）
    pub fn new(model: String, api_base: String) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(60))
            .build()
            .unwrap_or_else(|_| Client::new());
        Self {
            model,
            api_base,
            client,
        }
    }
}

/// Ollama /api/generate 请求体
#[derive(Debug, Serialize)]
struct OllamaGenerateRequest {
    model: String,
    prompt: String,
    stream: Option<bool>,
    options: Option<OllamaOptions>,
}

#[derive(Debug, Serialize)]
struct OllamaOptions {
    num_predict: u32,
}

/// Ollama /api/generate 响应体（非流式和流式共用）
#[derive(Debug, Deserialize)]
struct OllamaResponse {
    response: Option<String>,
    done: Option<bool>,
    #[allow(dead_code)]
    model: Option<String>,
}

/// 将 HTTP 状态码映射为 AIError
fn check_error(status: reqwest::StatusCode, body: &str) -> AIError {
    if status.as_u16() == 401 {
        return AIError::AuthError;
    }
    AIError::RequestFailed(format!("HTTP {}: {}", status, &body[..body.len().min(200)]))
}

#[async_trait]
impl AIProvider for OllamaProvider {
    async fn stream_completion(
        &self,
        request: CompletionRequest,
        max_tokens: u32,
    ) -> Result<CompletionStream, AIError> {
        // 使用 FIM 格式构造 prompt: <PRE>上文<SUF>下文<MID>
        let prompt = PromptBuilder::build_ollama_fim_prompt(&request);

        let body = OllamaGenerateRequest {
            model: self.model.clone(),
            prompt,
            stream: Some(true),
            options: Some(OllamaOptions {
                num_predict: max_tokens,  // num_predict 控制最大生成 token 数
            }),
        };

        let url = format!(
            "{}/api/generate",
            self.api_base.trim_end_matches('/')
        );
        tracing::debug!("Ollama streaming request: {} model={}", url, self.model);

        // POST /api/generate (stream=true)
        let response = self
            .client
            .post(&url)
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

        // Ollama 流式：每行一个 JSON 对象，通过 mpsc channel 将每行的 response 字段作为 token 发送
        let byte_stream = response.bytes_stream();
        let (tx, rx) = tokio::sync::mpsc::channel::<Result<CompletionChunk, AIError>>(32);

        // 后台任务：逐行解析 JSON，提取 response 字段作为 token，通过 channel 发送
        tokio::spawn(async move {
            let mut buffer = String::new();
            let mut stream = byte_stream;
            let mut id = String::new();

            while let Some(chunk_result) = stream.next().await {
                match chunk_result {
                    Ok(bytes) => {
                        buffer.push_str(&String::from_utf8_lossy(&bytes));

                        // Ollama 每行一个 JSON
                        while let Some(pos) = buffer.find('\n') {
                            let line = buffer[..pos].trim().to_string();
                            buffer = buffer[pos + 1..].to_string();

                            if line.is_empty() {
                                continue;
                            }

                            if let Ok(resp) = serde_json::from_str::<OllamaResponse>(&line) {
                                let token = resp.response.unwrap_or_default();
                                let done = resp.done.unwrap_or(false);

                                if id.is_empty() {
                                    id = format!("ollama-{}", std::time::SystemTime::now()
                                        .duration_since(std::time::UNIX_EPOCH)
                                        .unwrap_or_default()
                                        .as_millis());
                                }

                                if tx
                                    .send(Ok(CompletionChunk {
                                        token,
                                        done,
                                        completion_id: id.clone(),
                                    }))
                                    .await
                                    .is_err()
                                {
                                    return;
                                }

                                if done {
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
        // 非流式请求 POST /api/generate (stream=false 或不传)
        let prompt = PromptBuilder::build_ollama_fim_prompt(&request);

        let body = OllamaGenerateRequest {
            model: self.model.clone(),
            prompt,
            stream: None,
            options: Some(OllamaOptions {
                num_predict: max_tokens,
            }),
        };

        let url = format!(
            "{}/api/generate",
            self.api_base.trim_end_matches('/')
        );
        tracing::debug!("Ollama request: {} model={}", url, self.model);

        let response = self
            .client
            .post(&url)
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

        // Ollama 非流式返回多行 JSON（每行一个 chunk），取最后一个 done=true 的累积文本
        let mut full_text = String::new();
        for line in response_text.lines() {
            if let Ok(resp) = serde_json::from_str::<OllamaResponse>(line) {
                if let Some(token) = resp.response {
                    full_text.push_str(&token);
                }
            }
        }

        // 生成唯一 ID（基于时间戳）
        let id = format!(
            "ollama-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
        );

        Ok(vec![CompletionChunk {
            token: full_text,
            done: true,
            completion_id: id,
        }])
    }

    fn name(&self) -> &'static str {
        "ollama"
    }
}
