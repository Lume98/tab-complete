# Server 代码阅读指南

## 总览：18 个文件，7 层架构

```
main.rs (入口)
  └─ server.rs (核心调度)
       ├─ context.rs (上下文收集)
       ├─ prompt.rs (Prompt 模板)
       ├─ ai/ (AI Provider 层)
       │   ├─ mod.rs (trait 定义)
       │   ├─ claude.rs / openai.rs / ollama.rs (具体实现)
       │   ├─ streaming.rs (SSE 解析)
       │   └─ retry.rs (重试策略)
       ├─ filter.rs (后处理)
       ├─ cache/ (缓存)
       └─ config/ (配置)
```

---

## 第 1 层：入口 `main.rs`

8 行关键逻辑，看第 42-65 行即可：
- 创建 `AppConfig`、`AIProvider`、`CacheManager`
- 构建 `LspService`，注册 `textDocument/inlineCompletion`
- 通过 stdio 启动

---

## 第 2 层：核心调度 `server.rs`

这是整个项目的灵魂，重点看 `handle_inline_completion`（119-240 行）：

| 步骤 | 做什么 | 调用谁 |
|------|--------|--------|
| ① 读文档 | 从 `DocumentsState`（内存 HashMap）按 URI 取出全文 | `documents.get(&uri)` |
| ② 收集上下文 | 提取 prefix/suffix/上下文行 | `ContextCollector::collect()` |
| ③ 过滤 | 排除注释行、空行 | `should_complete()` |
| ④ 查缓存 | 按 language+prefix+suffix hash 查 | `cache.get(cache_key)` |
| ⑤ 调 AI | 流式 / 非流式分支 | `provider.stream_completion()` / `provider.complete()` |
| ⑥ 后处理 | 去 markdown、去重、截断 | `filter_completion()` + `truncate_completion()` |
| ⑦ 写缓存 | 缓存结果供后续命中 | `cache.put()` |

**流式模式的巧妙设计**（168-227 行）：用 `tokio::spawn` 后台解析 SSE，通过 `mpsc::channel` 转发 chunk，主循环每次收到 token 就发送 `custom/inlineCompletionUpdate` 通知 VS Code 刷新幽灵文本。流式失败自动降级到非流式。

**配置热切换**：`did_change_configuration` 被调用时，重建 AI Provider（第 88-93 行）。

**语言检测**：`detect_language()` 按文件扩展名映射 25+ 种编程语言（第 342-377 行）。

---

## 第 3 层：上下文收集 `context.rs`

`ContextCollector::collect()` 做的事很朴素：
- 把文档按行切分
- 取光标前的 N 行作为 `context_before`
- 取光标后的 N 行作为 `context_after`
- 当前行在光标处切开，分成 `prefix` / `suffix`
- `syntax_context` 字段目前始终为 `None`——语法解析是预留的扩展点

`should_complete()` 是简单的启发式过滤：按语言类型匹配注释前缀（`//`, `#`, `--`），光标在注释里就不触发。

---

## 第 4 层：AI Provider 抽象 `ai/mod.rs`

核心是 `AIProvider` trait：

```rust
pub trait AIProvider: Send + Sync {
    async fn stream_completion(...) -> Result<CompletionStream, AIError>;
    async fn complete(...) -> Result<Vec<CompletionChunk>, AIError>;
    fn name(&self) -> &'static str;
}
```

三个实现：`ClaudeProvider`、`OpenAIProvider`、`OllamaProvider`，通过 `create_provider()` 工厂函数创建。

`AIError` 有 7 种变体，重试策略：

| 变体 | 含义 | 重试 |
|------|------|------|
| `AuthError` | API Key 无效 | 否 |
| `RateLimited` | 429 限流 | 是 |
| `RequestFailed` | HTTP 错误 | 是 |
| `Timeout` | 请求超时 | 是 |
| `ContentFiltered` | 安全过滤 | 否 |
| `StreamParseError` | 响应解析失败 | 否 |
| `Unsupported` | 不支持的操作 | 否 |

---

## 第 5 层：具体实现 `claude.rs`

重点看流式流程 `stream_completion()`：
1. 用 `PromptBuilder::build_claude_prompt()` 构建 prompt
2. 发送 HTTP POST 到 `{api_base}/v1/messages`
3. 获取 `bytes_stream()`，spawn 后台 tokio 任务
4. 后台任务用 `SseParser` 逐块解析 SSE → `CompletionChunk` → 通过 mpsc channel 发送
5. 把 `ReceiverStream` 包装成 `Pin<Box<dyn Stream>>` 返回

非流式 `complete()` 更简单：发请求 → 等完整响应 → 从 `content` 数组提取 text 块。

`openai.rs` 和 `ollama.rs` 结构类似，只是 API 格式和 prompt 模板不同，可以跳过或快速扫一眼。

---

## 第 6 层：SSE 解析 `streaming.rs`

`SseParser` 是行缓冲解析器：
- `feed()` 追加数据，按 `\n\n` 分割事件块
- 解析 `event:` 和 `data:` 行
- 支持跨 chunk 的 partial 事件（缓冲区保留不完整数据）

`parse_claude_sse()` 把 Claude 的 SSE 事件类型（`message_start` / `content_block_delta` / `message_stop` 等）映射为内部枚举。

`parse_openai_sse()` 类似但解析 OpenAI 的 `choices[0].delta.content` 格式。

---

## 第 7 层：支撑模块

### `prompt.rs` — 三种 Prompt 格式

- **Claude**: 中文 system prompt + 代码上下文（markdown 代码块包裹）
- **OpenAI**: system + user messages（JSON 格式）
- **Ollama**: `<PRE>...<SUF>...<MID>` FIM 格式

### `filter.rs` — 后处理

- `filter_completion()`：去 markdown 代码块标记、去重 prefix
- `truncate_completion()`：截断到 20 行 / 512 字符

### `retry.rs` — 指数退避重试

- 最多 2 次，基础 500ms，指数退避 + 抖动
- `should_retry()` 白名单：只重试 `RateLimited`、`RequestFailed`、`Timeout`

### `cache/mod.rs` — 缓存管理

`tokio::sync::Mutex` 包裹 `LruCache`，暴露 `get/put/remove/clear` 接口。

### `cache/lru.rs` — LRU 实现

手写 LRU（基于 `HashMap + Instant`）：
- `get()` 先检查 TTL 过期再返回
- `put()` 容量满时淘汰最旧条目

### `config/mod.rs` — 配置加载

优先级：`配置文件 > 环境变量 > 默认值`

文件搜索路径：
1. `CWD/.ai-tab-complete.toml`
2. `HOME/.ai-tab-complete.toml`
3. `XDG_CONFIG_HOME/ai-tab-complete/config.toml`

---

## 建议阅读顺序

| 顺序 | 文件 | 预计时间 |
|------|------|----------|
| 1 | `main.rs` | 2 min |
| 2 | `server.rs` | 10 min |
| 3 | `protocol.rs` + `context.rs` | 5 min |
| 4 | `ai/mod.rs` + `prompt.rs` | 5 min |
| 5 | `ai/claude.rs` + `streaming.rs` | 10 min |
| 6 | `ai/retry.rs` + `filter.rs` | 5 min |
| 7 | `cache/mod.rs` + `cache/lru.rs` + `config/mod.rs` | 5 min |

总共约 40 分钟可读完。`openai.rs` 和 `ollama.rs` 结构跟 `claude.rs` 很像，可以跳过或快速扫一眼。
