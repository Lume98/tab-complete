pub mod lru;

use std::num::NonZeroUsize;
use tokio::sync::Mutex;

use self::lru::LruCache;

/// 缓存管理器
pub struct CacheManager {
    l2_cache: Mutex<LruCache<String, String>>,
    ttl_secs: u64,
}

impl CacheManager {
    pub fn new(max_entries: usize, ttl_secs: u64) -> Self {
        let capacity = NonZeroUsize::new(max_entries.max(1)).unwrap_or(NonZeroUsize::new(100).unwrap());
        Self {
            l2_cache: Mutex::new(LruCache::new(capacity, ttl_secs)),
            ttl_secs,
        }
    }

    pub async fn get(&self, key: &str) -> Option<String> {
        let mut cache = self.l2_cache.lock().await;
        cache.get(&key.to_string()).cloned()
    }

    pub async fn put(&self, key: String, value: String) {
        let mut cache = self.l2_cache.lock().await;
        cache.put(key, value);
    }

    pub async fn remove(&self, key: &str) {
        let mut cache = self.l2_cache.lock().await;
        cache.remove(&key.to_string());
    }

    pub async fn clear(&self) {
        let capacity = NonZeroUsize::new(500).unwrap();
        let mut cache = self.l2_cache.lock().await;
        *cache = LruCache::new(capacity, self.ttl_secs);
    }

    pub async fn len(&self) -> usize {
        let cache = self.l2_cache.lock().await;
        cache.len()
    }
}
