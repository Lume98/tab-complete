# Provider 概览

AI Tab Complete 通过统一的 Provider 接口支持多种 AI 服务，运行时动态切换。

## 支持的 Provider

| Provider | 类型 | 需要 API Key | 流式输出 | 适用场景 |
|----------|------|-------------|----------|----------|
| [Claude](./claude) | 云端 | ✅ Anthropic | ✅ | 高质量代码补全 |
| [OpenAI](./openai) | 云端 | ✅ OpenAI | ✅ | 通用代码补全 |
| [Ollama](./ollama) | 本地 | ❌ | ❌ | 离线 / 隐私优先 |

## 切换 Provider

在 `.ai-tab-complete.toml` 中修改一行即可：

```toml
provider = "claude"   # 切换到 Claude
provider = "openai"   # 切换到 OpenAI
provider = "ollama"   # 切换到 Ollama
```

## 架构

所有 Provider 实现统一的 `AIProvider` trait：

```rust
pub trait AIProvider: Send + Sync {
    async fn stream_completion(
        &self,
        request: CompletionRequest,
        max_tokens: usize,
    ) -> Result<..., AIError>;

    async fn complete(
        &self,
        request: CompletionRequest,
        max_tokens: usize,
    ) -> Result<Vec<CompletionChunk>, AIError>;

    fn name(&self) -> &'static str;
}
```

通过 `create_provider(ProviderType, config)` 工厂函数创建实例。

## 错误处理

所有 Provider 共享统一的错误类型和重试策略：

| 错误类型 | 说明 | 自动重试 |
|----------|------|----------|
| `AuthError` | API Key 无效 | 否 |
| `RateLimited` | 429 限流 | 是（指数退避） |
| `RequestFailed(u16)` | HTTP 错误 | 是 |
| `Timeout` | 请求超时 | 是 |
| `ParseError` | 响应解析失败 | 否 |
| `NetworkError` | 网络不可达 | 是 |

重试策略：最多 2 次，500ms 基础延迟，指数退避。
