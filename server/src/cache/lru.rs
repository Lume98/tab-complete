use std::collections::HashMap;
use std::num::NonZeroUsize;
use std::time::{Duration, Instant};

/// 带 TTL 的 LRU 缓存
pub struct LruCache<K, V> {
    map: HashMap<K, Entry<V>>,
    capacity: NonZeroUsize,
    ttl: Duration,
}

struct Entry<V> {
    value: V,
    last_access: Instant,
}

impl<K, V> LruCache<K, V>
where
    K: std::hash::Hash + Eq + Clone,
{
    pub fn new(capacity: NonZeroUsize, ttl_secs: u64) -> Self {
        Self {
            map: HashMap::with_capacity(capacity.get()),
            capacity,
            ttl: Duration::from_secs(ttl_secs),
        }
    }

    pub fn get(&mut self, key: &K) -> Option<&V> {
        // 先检查是否存在且未过期，避免双重借用
        let is_expired = self.map.get(key).map_or(false, |entry| {
            entry.last_access.elapsed() > self.ttl
        });

        if is_expired {
            self.map.remove(key);
            return None;
        }

        // 更新访问时间
        let entry = self.map.get_mut(key)?;
        entry.last_access = Instant::now();
        Some(&entry.value)
    }

    pub fn put(&mut self, key: K, value: V) {
        if self.map.len() >= self.capacity.get() && !self.map.contains_key(&key) {
            // 移除最早访问的条目
            let oldest_key = self
                .map
                .iter()
                .min_by_key(|(_, entry)| entry.last_access)
                .map(|(k, _)| k.clone());

            if let Some(k) = oldest_key {
                self.map.remove(&k);
            }
        }

        self.map.insert(key, Entry {
            value,
            last_access: Instant::now(),
        });
    }

    pub fn remove(&mut self, key: &K) -> Option<V> {
        self.map.remove(key).map(|entry| entry.value)
    }

    pub fn len(&self) -> usize {
        self.map.len()
    }

    pub fn is_empty(&self) -> bool {
        self.map.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::num::NonZeroUsize;

    #[test]
    fn test_lru_basic() {
        let mut cache: LruCache<String, String> = LruCache::new(
            NonZeroUsize::new(3).unwrap(),
            60,
        );

        cache.put("a".to_string(), "1".to_string());
        cache.put("b".to_string(), "2".to_string());
        cache.put("c".to_string(), "3".to_string());

        assert_eq!(cache.get(&"a".to_string()), Some(&"1".to_string()));
        assert_eq!(cache.get(&"b".to_string()), Some(&"2".to_string()));
        assert_eq!(cache.get(&"c".to_string()), Some(&"3".to_string()));
    }

    #[test]
    fn test_lru_eviction() {
        let mut cache: LruCache<String, String> = LruCache::new(
            NonZeroUsize::new(2).unwrap(),
            60,
        );

        cache.put("a".to_string(), "1".to_string());
        cache.put("b".to_string(), "2".to_string());
        cache.put("c".to_string(), "3".to_string()); // 'a' 应该被淘汰

        assert_eq!(cache.get(&"a".to_string()), None);
        assert_eq!(cache.get(&"b".to_string()), Some(&"2".to_string()));
        assert_eq!(cache.get(&"c".to_string()), Some(&"3".to_string()));
    }

    #[test]
    fn test_lru_ttl() {
        let mut cache: LruCache<String, String> = LruCache::new(
            NonZeroUsize::new(3).unwrap(),
            0, // 0 秒 TTL
        );

        cache.put("a".to_string(), "1".to_string());
        std::thread::sleep(Duration::from_millis(10));
        assert_eq!(cache.get(&"a".to_string()), None);
    }
}
