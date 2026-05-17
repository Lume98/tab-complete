use std::sync::Arc;
use std::time::Instant;

use tokio::sync::RwLock;
use tower_lsp::Client;

use crate::ai::{retry::RetryStrategy, AIProvider};
use crate::app::provider_factory::create_provider_from_config;
use crate::cache::CacheManager;
use crate::completion::context::{should_complete, CompletionRequest, ContextCollector};
use crate::completion::{filter, language};
use crate::config::AppConfig;
use crate::protocol::{
    InlineCompletionItem, InlineCompletionList, InlineCompletionParams, InlineCompletionUpdate,
    InlineCompletionUpdateParams,
};

pub struct CompletionService {
    config: Arc<RwLock<AppConfig>>,
    ai_provider: Arc<RwLock<Box<dyn AIProvider>>>,
    cache: Arc<CacheManager>,
}

impl CompletionService {
    pub fn new(
        config: Arc<RwLock<AppConfig>>,
        ai_provider: Arc<RwLock<Box<dyn AIProvider>>>,
        cache: Arc<CacheManager>,
    ) -> Self {
        Self {
            config,
            ai_provider,
            cache,
        }
    }

    pub async fn rebuild_provider(&self) {
        let config = self.config.read().await;
        tracing::info!(
            "Rebuilding provider from config: provider={}, claude_model={}, openai_model={}, ollama_model={}",
            config.provider,
            config.claude_model,
            config.openai_model,
            config.ollama_model
        );
        let new_provider = create_provider_from_config(&config);
        tracing::info!("Switched to AI provider: {}", new_provider.name());
        drop(config);

        let mut provider = self.ai_provider.write().await;
        *provider = new_provider;
    }

    pub async fn handle_inline_completion(
        &self,
        client: &Client,
        params: InlineCompletionParams,
        content: &str,
    ) -> Option<InlineCompletionList> {
        let uri = params.text_document.uri;
        let position = params.position;
        let language = language::detect_language(&uri);

        let config = self.config.read().await;
        let collector = ContextCollector::new(config.context_lines_before, config.context_lines_after);
        let request = collector.collect(
            content,
            position.line as usize,
            position.character as usize,
            uri.path(),
            &language,
        );

        if !should_complete(&request.prefix, &language) {
            return None;
        }

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

        let max_tokens = config.max_tokens;
        let enable_streaming = config.enable_streaming;
        drop(config);

        let provider = self.ai_provider.read().await;
        let start = Instant::now();

        if enable_streaming {
            match provider.stream_completion(request.clone(), max_tokens).await {
                Ok(mut stream) => {
                    use futures::StreamExt;

                    let stream_id = uuid::Uuid::new_v4().to_string();
                    let mut accumulated = String::new();

                    while let Some(chunk_result) = stream.next().await {
                        match chunk_result {
                            Ok(chunk) => {
                                accumulated.push_str(&chunk.token);

                                let update = InlineCompletionUpdateParams {
                                    stream_id: stream_id.clone(),
                                    text: accumulated.clone(),
                                    done: chunk.done,
                                };
                                let _ = client.send_notification::<InlineCompletionUpdate>(update);

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

                    tracing::info!("Streaming completion done in {:?}", start.elapsed());
                    self.finalize_completion(cache_key, request, accumulated, Some(stream_id))
                        .await
                }
                Err(e) => {
                    tracing::warn!(
                        "Streaming completion failed: {:?}, falling back to non-streaming",
                        e
                    );
                    self.complete_non_streaming(&provider, request, max_tokens, cache_key, start)
                        .await
                }
            }
        } else {
            self.complete_non_streaming(&provider, request, max_tokens, cache_key, start)
                .await
        }
    }

    async fn complete_non_streaming(
        &self,
        provider: &Box<dyn AIProvider>,
        request: CompletionRequest,
        max_tokens: u32,
        cache_key: String,
        start: Instant,
    ) -> Option<InlineCompletionList> {
        let retry = RetryStrategy::default();
        let result = retry.retry(|| provider.complete(request.clone(), max_tokens)).await;

        match result {
            Ok(chunks) => {
                tracing::info!("Non-streaming completion returned in {:?}", start.elapsed());
                let full_text: String = chunks.iter().map(|c| c.token.clone()).collect();
                self.finalize_completion(cache_key, request, full_text, None).await
            }
            Err(e) => {
                tracing::warn!("AI completion failed after retries: {:?}", e);
                None
            }
        }
    }

    async fn finalize_completion(
        &self,
        cache_key: String,
        request: CompletionRequest,
        raw_text: String,
        stream_id: Option<String>,
    ) -> Option<InlineCompletionList> {
        let filtered = filter::filter_completion(&raw_text, &request.prefix)?;
        let truncated = filter::truncate_completion(&filtered, 20, 512);
        self.cache.put(cache_key, truncated.clone()).await;

        Some(InlineCompletionList {
            items: vec![InlineCompletionItem {
                text: truncated,
                stream_id,
            }],
        })
    }
}

fn build_cache_key(request: &CompletionRequest) -> String {
    use std::hash::{Hash, Hasher};

    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    request.prefix.hash(&mut hasher);
    request.suffix.hash(&mut hasher);
    request.language.hash(&mut hasher);
    format!("{}-{:x}", request.language, hasher.finish())
}
