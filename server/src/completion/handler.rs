use std::sync::Arc;
use tokio::sync::RwLock;

use crate::ai::AIProvider;
use crate::cache::CacheManager;
use crate::completion::context::{CompletionRequest, ContextCollector};
use crate::completion::filter;
use crate::config::AppConfig;
use crate::protocol::{InlineCompletionItem, InlineCompletionList};

/// 补全请求处理器
pub struct CompletionHandler {
    ai_provider: Arc<RwLock<Box<dyn AIProvider>>>,
    cache: Arc<CacheManager>,
    config: Arc<RwLock<AppConfig>>,
    context_collector: ContextCollector,
}

impl CompletionHandler {
    pub fn new(
        ai_provider: Arc<RwLock<Box<dyn AIProvider>>>,
        cache: Arc<CacheManager>,
        config: Arc<RwLock<AppConfig>>,
    ) -> Self {
        let config_guard = config.blocking_read();
        let context_collector = ContextCollector::new(
            config_guard.context_lines_before,
            config_guard.context_lines_after,
        );
        drop(config_guard);

        Self {
            ai_provider,
            cache,
            config,
            context_collector,
        }
    }

    /// 处理补全请求
    pub async fn handle_completion(
        &self,
        request: CompletionRequest,
    ) -> Option<InlineCompletionList> {
        // 1. 检查缓存
        let cache_key = self.build_cache_key(&request);
        if let Some(cached) = self.cache.get(&cache_key).await {
            tracing::debug!("Cache hit for completion");
            return Some(InlineCompletionList {
                items: vec![InlineCompletionItem {
                    text: cached,
                    stream_id: None,
                }],
            });
        }

        // 2. 调用 AI Provider
        let config = self.config.read().await;
        let max_tokens = config.max_tokens;
        drop(config);

        let provider = self.ai_provider.read().await;
        let result = provider.complete(request.clone(), max_tokens).await;

        match result {
            Ok(chunks) => {
                let full_text: String = chunks.iter().map(|c| c.token.clone()).collect();

                // 3. 后处理
                let filtered = filter::filter_completion(&full_text, &request.prefix);
                match filtered {
                    Some(text) => {
                        // 4. 写入缓存
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
                tracing::warn!("AI completion failed: {:?}", e);
                None
            }
        }
    }

    fn build_cache_key(&self, request: &CompletionRequest) -> String {
        use std::hash::{Hash, Hasher};
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        request.prefix.hash(&mut hasher);
        request.suffix.hash(&mut hasher);
        request.language.hash(&mut hasher);
        format!("{}-{:x}", request.language, hasher.finish())
    }
}
