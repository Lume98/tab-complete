use std::sync::Arc;
use tokio::sync::RwLock;
use tower_lsp::jsonrpc::Result;
use tower_lsp::lsp_types::*;
use tower_lsp::{Client, LanguageServer};

use crate::ai::{retry::RetryStrategy, AIProvider};
use crate::cache::CacheManager;
use crate::completion::context::{should_complete, ContextCollector};
use crate::completion::filter;
use crate::config::{AIProviderType, AppConfig};
use crate::protocol::{
    InlineCompletionItem, InlineCompletionList, InlineCompletionParams,
    InlineCompletionUpdate, InlineCompletionUpdateParams,
};

/// LSP Backend - 所有请求和通知的路由入口
pub struct Backend {
    pub client: Client,
    pub documents: Arc<RwLock<DocumentsState>>,
    pub config: Arc<RwLock<AppConfig>>,
    pub ai_provider: Arc<RwLock<Box<dyn AIProvider>>>,
    pub cache: Arc<CacheManager>,
}

/// 文档状态 - 维护已打开文档的内存内容
#[derive(Debug, Default)]
pub struct DocumentsState {
    pub docs: std::collections::HashMap<Url, String>,
}

#[tower_lsp::async_trait]
impl LanguageServer for Backend {
    async fn initialize(&self, _params: InitializeParams) -> Result<InitializeResult> {
        Ok(InitializeResult {
            capabilities: ServerCapabilities {
                text_document_sync: Some(TextDocumentSyncCapability::Kind(
                    TextDocumentSyncKind::INCREMENTAL,
                )),
                ..Default::default()
            },
            server_info: Some(ServerInfo {
                name: "ai-tab-complete-lsp".to_string(),
                version: Some("0.1.0".to_string()),
            }),
        })
    }

    async fn initialized(&self, _params: InitializedParams) {
        self.client
            .log_message(MessageType::INFO, "AI Tab Complete LSP server initialized")
            .await;
        tracing::info!("AI Tab Complete LSP server initialized");
    }

    async fn shutdown(&self) -> Result<()> {
        Ok(())
    }

    async fn did_open(&self, params: DidOpenTextDocumentParams) {
        let mut docs = self.documents.write().await;
        docs.docs.insert(params.text_document.uri, params.text_document.text);
    }

    async fn did_change(&self, params: DidChangeTextDocumentParams) {
        let mut docs = self.documents.write().await;
        if let Some(content) = docs.docs.get_mut(&params.text_document.uri) {
            for change in params.content_changes {
                match change.range {
                    Some(range) => {
                        if let Some(new_content) = apply_incremental_edit(content, &range, &change.text) {
                            *content = new_content;
                        }
                    }
                    None => {
                        *content = change.text;
                    }
                }
            }
        }
    }

    async fn did_close(&self, params: DidCloseTextDocumentParams) {
        let mut docs = self.documents.write().await;
        docs.docs.remove(&params.text_document.uri);
    }

    async fn did_change_configuration(&self, _params: DidChangeConfigurationParams) {
        // VS Code 通过 synchronize.configurationSection 自动推送配置变更
        // 这里触发 provider 重建
        tracing::info!("Configuration changed, rebuilding provider");
        self.rebuild_provider().await;
    }
}

impl Backend {
    /// 根据 config 中的 provider 类型重建 AI Provider
    pub async fn rebuild_provider(&self) {
        let config = self.config.read().await;
        let new_provider = create_provider_from_config(&config);
        tracing::info!("Switched to AI provider: {}", new_provider.name());
        drop(config);

        let mut provider = self.ai_provider.write().await;
        *provider = new_provider;
    }

    /// 处理内联补全请求（返回 LSP Result 包装）
    pub async fn handle_inline_completion_lsp(
        &self,
        params: InlineCompletionParams,
    ) -> Result<Option<InlineCompletionList>> {
        Ok(self.handle_inline_completion(params).await)
    }

    /// 处理内联补全请求（核心流程）
    ///
    /// 流程：读取文档 → 收集上下文 → 检查是否触发 → 查缓存 → 调用 AI → 后处理
    async fn handle_inline_completion(
        &self,
        params: InlineCompletionParams,
    ) -> Option<InlineCompletionList> {
        let uri = params.text_document.uri;
        let position = params.position;

        // 1. 读取当前文档内容（从内存中的文档快照）
        let docs = self.documents.read().await;
        let content = docs.docs.get(&uri)?;
        let language = detect_language(&uri);

        // 2. 收集上下文：prefix/suffix/上下文行/语法信息
        let config = self.config.read().await;
        let collector = ContextCollector::new(config.context_lines_before, config.context_lines_after);
        let request = collector.collect(
            content,
            position.line as usize,
            position.character as usize,
            uri.path(),
            &language,
        );
        drop(docs);

        // 3. 过滤：空行、注释中不触发补全
        if !should_complete(&request.prefix, &language) {
            return None;
        }

        // 4. 检查服务端缓存（按 prefix+suffix+language hash）
        let cache_key = build_cache_key(&request);
        if let Some(cached) = self.cache.get(&cache_key).await {
            tracing::debug!("Cache hit");
            return Some(InlineCompletionList {
                items: vec![InlineCompletionItem {
                    text: cached,
                    stream_id: None,
                }],
            });
        }

        // 5. 调用 AI Provider
        let max_tokens = config.max_tokens;
        let enable_streaming = config.enable_streaming;
        drop(config);

        let provider = self.ai_provider.read().await;
        let start = std::time::Instant::now();

        if enable_streaming {
            // 流式模式：逐 token 推送更新通知到 VS Code 客户端
            match provider.stream_completion(request.clone(), max_tokens).await {
                Ok(mut stream) => {
                    use futures::StreamExt;

                    let stream_id = uuid::Uuid::new_v4().to_string();
                    let mut accumulated = String::new();
                    let mut completion_id = String::new();

                    // 逐个消费 SSE chunk，累积 token 并通过 custom/inlineCompletionUpdate 推送
                    while let Some(chunk_result) = stream.next().await {
                        match chunk_result {
                            Ok(chunk) => {
                                if !chunk.completion_id.is_empty() {
                                    completion_id = chunk.completion_id;
                                }
                                accumulated.push_str(&chunk.token);

                                // 每收到一个 token 立即通知 VS Code 刷新幽灵文本
                                let update = InlineCompletionUpdateParams {
                                    stream_id: stream_id.clone(),
                                    text: accumulated.clone(),
                                    done: chunk.done,
                                };
                                let _ = self.client
                                    .send_notification::<InlineCompletionUpdate>(update);

                                if chunk.done {
                                    break;
                                }
                            }
                            Err(e) => {
                                tracing::warn!("Stream error: {:?}", e);
                                break;
                            }
                        }
                    }

                    let elapsed = start.elapsed();
                    tracing::info!("Streaming completion done in {:?}", elapsed);

                    // 6. 后处理：过滤代码块标记、去重 prefix、截断
                    let filtered = filter::filter_completion(&accumulated, &request.prefix);
                    match filtered {
                        Some(text) => {
                            let truncated = filter::truncate_completion(&text, 20, 512);
                            // 7. 写入缓存
                            self.cache.put(cache_key, truncated.clone()).await;

                            Some(InlineCompletionList {
                                items: vec![InlineCompletionItem {
                                    text: truncated,
                                    stream_id: Some(stream_id),
                                }],
                            })
                        }
                        None => None,
                    }
                }
                Err(e) => {
                    // 流式失败降级到非流式
                    tracing::warn!("Streaming completion failed: {:?}, falling back to non-streaming", e);
                    self.complete_non_streaming(&provider, request, max_tokens, cache_key, start)
                        .await
                }
            }
        } else {
            // 非流式模式：一次性返回完整结果
            self.complete_non_streaming(&provider, request, max_tokens, cache_key, start)
                .await
        }
    }

    /// 非流式补全（带指数退避重试）
    /// 流程：重试调用 AI → 合并 chunks → 后处理 → 缓存
    async fn complete_non_streaming(
        &self,
        provider: &Box<dyn AIProvider>,
        request: crate::completion::context::CompletionRequest,
        max_tokens: u32,
        cache_key: String,
        start: std::time::Instant,
    ) -> Option<InlineCompletionList> {
        let retry = RetryStrategy::default();
        let result = retry.retry(|| {
            provider.complete(request.clone(), max_tokens)
        }).await;

        match result {
            Ok(chunks) => {
                let elapsed = start.elapsed();
                tracing::info!("Non-streaming completion returned in {:?}", elapsed);

                let full_text: String = chunks.iter().map(|c| c.token.clone()).collect();
                let filtered = filter::filter_completion(&full_text, &request.prefix);
                match filtered {
                    Some(text) => {
                        let truncated = filter::truncate_completion(&text, 20, 512);
                        self.cache.put(cache_key, truncated.clone()).await;

                        Some(InlineCompletionList {
                            items: vec![InlineCompletionItem {
                                text: truncated,
                                stream_id: None,
                            }],
                        })
                    }
                    None => None,
                }
            }
            Err(e) => {
                tracing::warn!("AI completion failed after retries: {:?}", e);
                None
            }
        }
    }
}

/// 构建缓存 key：language + prefix/suffix 的 hash
/// 相同语言、相同光标位置的请求命中同一缓存
fn build_cache_key(request: &crate::completion::context::CompletionRequest) -> String {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    request.prefix.hash(&mut hasher);
    request.suffix.hash(&mut hasher);
    request.language.hash(&mut hasher);
    format!("{}-{:x}", request.language, hasher.finish())
}

/// 将 range 范围内的文本替换为 new_text，实现增量文档同步
/// VS Code 发送增量的 didChange 事件，需要逐个应用编辑操作
fn apply_incremental_edit(content: &str, range: &Range, new_text: &str) -> Option<String> {
    let mut result = String::new();
    let lines: Vec<&str> = content.lines().collect();
    let start_line = range.start.line as usize;
    let start_char = range.start.character as usize;
    let end_line = range.end.line as usize;
    let end_char = range.end.character as usize;

    for (i, line) in lines.iter().enumerate() {
        if i < start_line {
            result.push_str(line);
            result.push('\n');
        } else if i == start_line {
            result.push_str(&line[..start_char]);
            result.push_str(new_text);
            if start_line == end_line && end_char < line.len() {
                result.push_str(&line[end_char..]);
            }
            if start_line < end_line {
                result.push('\n');
            }
        } else if i > start_line && i < end_line {
            // Skip
        } else if i == end_line && start_line != end_line {
            if end_char < line.len() {
                result.push_str(&line[end_char..]);
            }
            if i < lines.len() - 1 {
                result.push('\n');
            }
        } else {
            result.push_str(line);
            if i < lines.len() - 1 {
                result.push('\n');
            }
        }
    }

    Some(result)
}

/// 根据文件扩展名推断编程语言（用于 prompt 中的语言标识和补全策略选择）
fn detect_language(uri: &Url) -> String {
    let path = uri.path();
    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    match ext {
        "rs" => "rust".to_string(),
        "ts" | "tsx" => "typescript".to_string(),
        "js" | "jsx" => "javascript".to_string(),
        "py" => "python".to_string(),
        "go" => "go".to_string(),
        "java" => "java".to_string(),
        "cpp" | "cc" | "cxx" => "cpp".to_string(),
        "c" => "c".to_string(),
        "h" | "hpp" => "c_header".to_string(),
        "cs" => "csharp".to_string(),
        "rb" => "ruby".to_string(),
        "php" => "php".to_string(),
        "swift" => "swift".to_string(),
        "kt" | "kts" => "kotlin".to_string(),
        "scala" => "scala".to_string(),
        "toml" => "toml".to_string(),
        "json" => "json".to_string(),
        "yaml" | "yml" => "yaml".to_string(),
        "md" => "markdown".to_string(),
        "html" => "html".to_string(),
        "css" => "css".to_string(),
        "sql" => "sql".to_string(),
        "sh" | "bash" => "bash".to_string(),
        "zsh" => "zsh".to_string(),
        "ps1" => "powershell".to_string(),
        "dart" => "dart".to_string(),
        _ => ext.to_string(),
    }
}

/// 工厂函数：根据配置中的 provider 类型创建对应的 AI Provider 实例
/// 支持运行时切换（配置变更时重建 provider）
pub fn create_provider_from_config(config: &AppConfig) -> Box<dyn AIProvider> {
    match config.provider {
        AIProviderType::Claude => {
            let api_key = config.resolve_claude_api_key();
            tracing::debug!("Claude API key: {}", api_key.as_ref().map(|k| crate::config::env::mask_api_key(k)).unwrap_or("none".to_string()));
            Box::new(crate::ai::claude::ClaudeProvider::new(
                api_key,
                config.claude_model.clone(),
                config.claude_api_base.clone(),
            )) as Box<dyn AIProvider>
        }
        AIProviderType::OpenAI => {
            let api_key = config.resolve_openai_api_key();
            tracing::debug!("OpenAI API key: {}", api_key.as_ref().map(|k| crate::config::env::mask_api_key(k)).unwrap_or("none".to_string()));
            Box::new(crate::ai::openai::OpenAIProvider::new(
                api_key,
                config.openai_model.clone(),
                config.openai_api_base.clone(),
            )) as Box<dyn AIProvider>
        }
        AIProviderType::Ollama => {
            Box::new(crate::ai::ollama::OllamaProvider::new(
                config.ollama_model.clone(),
                config.ollama_api_base.clone(),
            )) as Box<dyn AIProvider>
        }
    }
}
