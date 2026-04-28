use std::time::Duration;
use tokio::time::sleep;

use super::AIError;

/// 重试策略
#[derive(Debug, Clone)]
pub struct RetryStrategy {
    /// 最大重试次数
    pub max_retries: u32,
    /// 基础等待时间 (ms)
    pub base_delay_ms: u64,
    /// 最大等待时间 (ms)
    pub max_delay_ms: u64,
}

impl Default for RetryStrategy {
    fn default() -> Self {
        Self {
            max_retries: 2,
            base_delay_ms: 500,
            max_delay_ms: 8000,
        }
    }
}

impl RetryStrategy {
    /// 执行异步操作，失败时按策略重试
    pub async fn retry<F, Fut, T>(&self, operation: F) -> Result<T, AIError>
    where
        F: Fn() -> Fut,
        Fut: std::future::Future<Output = Result<T, AIError>>,
    {
        let mut last_error = AIError::RequestFailed("max retries exceeded".to_string());

        for attempt in 0..=self.max_retries {
            match operation().await {
                Ok(result) => return Ok(result),
                Err(err) => {
                    if !should_retry(&err) {
                        return Err(err);
                    }
                    last_error = err;
                    if attempt < self.max_retries {
                        let delay = self.backoff(attempt);
                        tracing::warn!(
                            "Retry attempt {}/{} after {}ms",
                            attempt + 1,
                            self.max_retries,
                            delay
                        );
                        sleep(Duration::from_millis(delay)).await;
                    }
                }
            }
        }

        Err(last_error)
    }

    /// 指数退避 + 抖动
    fn backoff(&self, attempt: u32) -> u64 {
        let delay = self.base_delay_ms * 2u64.pow(attempt);
        let jitter = simple_jitter(delay);
        std::cmp::min(delay + jitter, self.max_delay_ms)
    }
}

/// 判断错误是否可重试
fn should_retry(err: &AIError) -> bool {
    matches!(
        err,
        AIError::RateLimited | AIError::RequestFailed(_) | AIError::Timeout
    )
}

/// 简单抖动：基于时间的伪随机 ±25%
fn simple_jitter(base: u64) -> u64 {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos() as u64;
    let range = base / 4;
    now % range
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_retry_success_first_try() {
        let strategy = RetryStrategy::default();
        let result: Result<i32, AIError> = strategy.retry(|| async { Ok(42) }).await;
        assert_eq!(result.unwrap(), 42);
    }

    #[tokio::test]
    async fn test_retry_success_after_failure() {
        let strategy = RetryStrategy {
            max_retries: 2,
            base_delay_ms: 10,
            max_delay_ms: 100,
        };
        let attempts = std::sync::Arc::new(std::sync::atomic::AtomicU32::new(0));
        let attempts_clone = attempts.clone();

        let result = strategy
            .retry(move || {
                let a = attempts_clone.clone();
                async move {
                    let n = a.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                    if n < 2 {
                        Err(AIError::Timeout)
                    } else {
                        Ok("success")
                    }
                }
            })
            .await;

        assert_eq!(result.unwrap(), "success");
        assert_eq!(attempts.load(std::sync::atomic::Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn test_retry_no_retry_on_auth_error() {
        let strategy = RetryStrategy {
            max_retries: 3,
            base_delay_ms: 10,
            max_delay_ms: 100,
        };
        let result = strategy
            .retry(|| async { Err::<(), _>(AIError::AuthError) })
            .await;
        assert!(matches!(result, Err(AIError::AuthError)));
    }
}
