# 架构概览

## 整体架构

```
┌─────────────────────────────────┐
│       VS Code Extension (TS)    │
│  InlineCompletionItemProvider   │
│  Debounce → ClientCache → LSP   │
└──────────────┬──────────────────┘
               │ LSP (stdio)
               ▼
┌─────────────────────────────────┐
│        Rust LSP Server          │
│  tower-lsp Backend              │
│  Context → Cache → AI Provider  │
│  Claude / OpenAI / Ollama       │
└─────────────────────────────────┘
```

双语言架构：TypeScript 负责 VS Code 集成（UI 层），Rust 负责高性能补全逻辑和 AI API 调用（计算层）。通过 LSP stdio 协议通信。

## 数据流

```
用户打字
  → Debouncer (150ms)
  → ClientCache 检查 (TS 端, 100 条目, 5s TTL)
  → LSP textDocument/inlineCompletion 请求
  → Backend::handle_inline_completion()
    → ContextCollector 收集上下文 (prefix/suffix/语言)
    → should_complete() 过滤
    → CacheManager 检查 (LruCache, 1000 条目, 300s TTL)
    → AIProvider::stream_completion() / complete()
    → filter_completion() 后处理
    → 写入缓存
    → 返回 InlineCompletionList
  → VS Code 渲染幽灵文本
  → Tab 接受 / Esc 取消
```

## 流式模式

Rust 端 `tokio::spawn` 后台任务解析 SSE 流，通过自定义 LSP 通知 `custom/inlineCompletionUpdate` 逐 token 推送到客户端，客户端监听并刷新幽灵文本。用户看到渐进的补全动画。

## 双端缓存

| 层级 | 位置 | 容量 | TTL | Key |
|------|------|------|-----|-----|
| ClientCache | TS Provider | 100 条目 | 5s | prefix + position |
| LruCache | Rust CacheManager | 1000 条目 | 300s | prefix-hash + language |

文件变更 (`did_change`) 时自动失效。

## 核心接口

### AIProvider Trait

```rust
#[async_trait]
pub trait AIProvider: Send + Sync {
    async fn stream_completion(
        &self,
        request: CompletionRequest,
        max_tokens: usize,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<CompletionChunk, AIError>> + Send>>, AIError>;

    async fn complete(
        &self,
        request: CompletionRequest,
        max_tokens: usize,
    ) -> Result<Vec<CompletionChunk>, AIError>;

    fn name(&self) -> &'static str;
}
```

工厂函数 `create_provider(ProviderType, config)` 创建实例，运行时动态切换。

### AIError

| 变体 | 含义 | 自动重试 |
|------|------|----------|
| `AuthError` | API Key 无效 | 否 |
| `RateLimited` | 429 限流 | 是 |
| `RequestFailed(u16)` | HTTP 错误 | 是 |
| `Timeout` | 请求超时 | 是 |
| `ParseError(String)` | 响应解析失败 | 否 |
| `NetworkError(String)` | 网络不可达 | 是 |

## 项目结构

```
ai-tab-complete/
├── server/                        # Rust LSP Server
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs                # 入口
│       ├── lsp/backend.rs         # LSP Backend + 请求路由
│       ├── protocol.rs            # 自定义协议类型
│       ├── ai/                    # AI Provider 适配器
│       ├── completion/            # 补全逻辑
│       ├── cache/                 # LRU 缓存
│       └── config/                # 配置管理
│
├── vscode-extension/              # VS Code TypeScript 扩展
│   ├── package.json
│   └── src/
│       ├── extension.ts           # 入口
│       ├── lsp/                   # LSP 客户端
│       ├── completion/            # 补全提供器
│       ├── config/                # 设置管理
│       └── status/                # 状态栏
│
└── docs-site/                     # 本文档站
```

## Prompt 策略

| Provider | Prompt 格式 |
|----------|------------|
| Claude | System + single user message (语言/上下文/当前行) |
| OpenAI | System + user messages JSON |
| Ollama | FIM `<PRE>...<SUF>...<MID>` |

## 跨平台构建

| 平台 | Rust Target |
|------|-------------|
| Windows x64 | `x86_64-pc-windows-msvc` |
| Linux x64 | `x86_64-unknown-linux-gnu` |
| macOS Intel | `x86_64-apple-darwin` |
| macOS ARM | `aarch64-apple-darwin` |

Release 构建启用 LTO + strip。打 tag 触发 GitHub Actions 自动构建发布。

## 性能目标

- 补全延迟: p95 < 500ms
- 缓存命中率: > 60%
- 内存占用: < 200MB
