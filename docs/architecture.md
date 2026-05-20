# AI Tab Complete — 技术架构

## 架构概览

```
┌─────────────────────────────────┐
│       VS Code Extension (TS)    │
│  Runtime → ClientRouter         │
│  Debounce → ClientCache → Client│
└──────────────┬──────────────────┘
               │ mock / LSP (stdio)
               ▼
┌─────────────────────────────────┐
│        Rust LSP Server          │
│  tower-lsp Backend              │
│  Context → Cache → AI Provider  │
│  Claude / OpenAI / Ollama       │
└─────────────────────────────────┘
```

双语言架构：TypeScript 负责 VS Code 集成、运行时状态和客户端路由，Rust 负责补全逻辑和 AI API 调用。开发期默认启用 mock client；关闭 `aiTabComplete.useMockClient` 后通过 LSP stdio 与 Rust server 通信。

---

## 数据流

```
用户打字
  → Debouncer (150ms)
  → ClientCache 检查
  → CompletionClientRouter
  → MockInlineCompletionClient 或 LSP textDocument/inlineCompletion 请求
  → lsp::Backend::handle_inline_completion_lsp()
    → app::CompletionService::handle_inline_completion()
    → ContextCollector 收集上下文 (prefix/suffix/语言)
    → should_complete() 过滤
    → CacheManager 检查 (LruCache, TTL)
    → AIProvider::stream_completion() / complete()
    → filter_completion() 后处理
    → 写入缓存
    → 返回 InlineCompletionList
  → VS Code 渲染幽灵文本
  → Tab 接受 / Esc 取消
```

流式模式：Rust 端 `tokio::spawn` 后台解析 SSE，通过 `custom/inlineCompletionUpdate` 通知推送到客户端。TS 侧 `LspClient` 转发到 `CompletionClientRouter`，`AIInlineCompletionProvider` 用 `StreamTracker` 记录当前 stream，并触发 VS Code 重新请求 inline suggestion；下一次 provider 调用优先返回最新流文本，stream 完成后再写入 client cache。

---

## 项目结构

```
ai-tab-complete/
├── server/                         # Rust LSP Server
│   ├── Cargo.toml                  # tower-lsp 0.20, tokio, reqwest, tiktoken-rs
│   └── src/
│       ├── main.rs                 # bootstrap：初始化配置、组装依赖、启动 LspService
│       ├── app/
│       │   ├── completion_service.rs # 补全主流程编排
│       │   └── provider_factory.rs # 根据配置创建 AI Provider
│       ├── lsp/
│       │   ├── backend.rs          # LSP 生命周期 + 请求路由
│       │   ├── documents.rs        # 已打开文档状态
│       │   └── edits.rs            # 增量编辑应用
│       ├── protocol.rs             # 自定义协议类型
│       ├── ai/
│       │   ├── mod.rs              # AIProvider trait + 工厂函数
│       │   ├── claude.rs           # Anthropic Messages API (SSE 流式)
│       │   ├── openai.rs           # OpenAI Chat Completions API
│       │   ├── ollama.rs           # Ollama /api/generate (本地模型)
│       │   ├── streaming.rs        # SSE 解析器 (Claude/OpenAI 格式)
│       │   └── retry.rs            # 指数退避重试 (最多 2 次, 500ms 基础延迟)
│       ├── completion/
│       │   ├── context.rs          # 上下文收集 + CompletionRequest
│       │   ├── language.rs         # 根据 URI 扩展名检测语言
│       │   ├── prompt.rs           # Prompt 模板 (Claude/OpenAI/Ollama FIM)
│       │   └── filter.rs           # 后处理：去 markdown、截断 (20行/512字符)
│       ├── cache/
│       │   ├── mod.rs              # CacheManager (异步 Mutex + LruCache)
│       │   └── lru.rs              # LRU 实现 (HashMap + TTL + 淘汰)
│       └── config/
│           ├── mod.rs              # AppConfig (16 字段, 配置文件>环境变量>默认值)
│           └── env.rs              # API Key 环境变量 + mask_api_key() 脱敏
│
├── vscode-extension/                      # VS Code Extension
│   ├── package.json                # 引擎 ^1.116.0, 配置项, 命令, 快捷键
│   ├── src/
│   │   ├── extension.ts            # 入口：委托 runtime 激活/释放
│   │   ├── bootstrap/
│   │   │   ├── runtime/
│   │   │   │   ├── extension-runtime.ts # 扩展装配：状态栏/设置/客户端/注册
│   │   │   │   ├── client-runtime.ts    # client 生命周期状态机
│   │   │   │   └── settings-restart-policy.ts # 配置变更策略
│   │   │   └── registrations/       # 命令/Provider/配置同步注册
│   │   ├── core/
│   │   │   ├── completion-client/   # InlineCompletionClient 接口、router、mock client
│   │   │   ├── config/              # provider model 解析、settings 封装
│   │   │   ├── lsp/                 # LspClient、protocol、server-manager
│   │   │   └── status/              # StatusIndicator
│   │   ├── completion/
│   │   │   ├── provider.ts         # AIInlineCompletionItemProvider
│   │   │   ├── inline-completion-resolver.ts # 请求构建、缓存、流式文本返回
│   │   │   ├── cache.ts            # ClientCache (LRU, 100 条目, 5s TTL)
│   │   │   ├── debounce.ts         # Debouncer (150ms, CancellationToken)
│   │   │   └── stream-tracker.ts   # 当前活跃流状态
│   │   ├── commands/
│   │   │   ├── accept-command.ts   # Tab 接受
│   │   │   └── dismiss-command.ts  # Esc 取消
│   └── lsp-bin/                    # 预编译二进制 (按平台)
│
├── scripts/                        # build.sh / build.ps1
└── .github/workflows/release.yml   # 4 平台 CI/CD (win/linux/mac)
```

---

## 核心接口

### AIProvider Trait (Rust)

```rust
#[async_trait]
pub trait AIProvider: Send + Sync {
    async fn stream_completion(&self, request: CompletionRequest, max_tokens: usize)
        -> Result<Pin<Box<dyn Stream<Item = Result<CompletionChunk, AIError>> + Send>>, AIError>;
    async fn complete(&self, request: CompletionRequest, max_tokens: usize)
        -> Result<Vec<CompletionChunk>, AIError>;
    fn name(&self) -> &'static str;
}
```

通过 `create_provider(ProviderType, config)` 工厂函数创建，支持运行时切换。

### AIError 类型

| 变体 | 含义 | 重试 |
|------|------|------|
| `AuthError` | API Key 无效 | 否 |
| `RateLimited` | 429 限流 | 是 |
| `RequestFailed(u16)` | HTTP 错误 | 是 |
| `Timeout` | 请求超时 | 是 |
| `ParseError(String)` | 响应解析失败 | 否 |
| `NetworkError(String)` | 网络不可达 | 是 |

### 自定义 LSP 协议

| 方法 | 方向 | 用途 |
|------|------|------|
| `textDocument/inlineCompletion` | Client → Server | 请求补全 |
| `custom/inlineCompletionUpdate` | Server → Client | 流式推送 |
| `textDocument/clearCache` | Client → Server | 清理 server cache |

### TS Client Runtime

`ExtensionRuntime` 负责组装 `Settings`、`StatusIndicator`、`CompletionClientRouter`、mock client 和 LSP client factory。`ClientRuntime` 是唯一的客户端生命周期状态机，状态包括 `idle`、`starting`、`ready`、`restarting`、`stopped`、`failed`。状态栏只由 `ClientRuntime` 写入，配置同步通过 restart/hot-update 动作回到运行时，避免 UI 状态绕过运行时。

`CompletionClientRouter` 是 provider 面向的稳定 client 门面。运行时在 mock/LSP 切换时只替换 router 内部 active client，provider 不需要重新注册。router 同时隔离流式监听器异常，连续失败超过 `aiTabComplete.streamListenerMaxFailures` 后移除不稳定监听器。

---

## 双端缓存设计

| 层级 | 位置 | 容量 | TTL | Key |
|------|------|------|-----|-----|
| ClientCache | TS Provider | 100 条目 | 5s | uri + version + line + prefix + provider + model |
| LruCache | Rust CacheManager | 1000 条目 | 300s | prefix-hash + language |

TS 侧 cache key 包含 document version，文档变更后自然失效。流式补全未完成时不写入 TS cache，完成事件到达后才缓存最终文本。

---

## 配置优先级

```
配置文件 (.ai-tab-complete.toml) > 环境变量 > VS Code Settings > 默认值
```

配置文件搜索路径：`CWD/.ai-tab-complete.toml` > `HOME/.ai-tab-complete.toml` > `XDG/ai-tab-complete/config.toml`

API Key 环境变量：`ANTHROPIC_API_KEY`、`OPENAI_API_KEY`

---

## VS Code 配置项

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `aiTabComplete.provider` | enum | `claude` | AI 提供商 (claude/openai/ollama) |
| `aiTabComplete.claude.model` | string | `claude-sonnet-4-20250514` | Claude 模型名称 |
| `aiTabComplete.openai.model` | string | `gpt-4o` | OpenAI 模型名称 |
| `aiTabComplete.ollama.model` | string | `codellama` | Ollama 模型名称 |
| `aiTabComplete.debounceMs` | number | `150` | 防抖延迟 |
| `aiTabComplete.maxTokens` | number | `256` | 最大补全 token 数 |
| `aiTabComplete.enableAutoCompletion` | bool | `true` | 启用自动补全 |
| `aiTabComplete.useMockClient` | bool | `true` | 开发期使用本地 mock client |
| `aiTabComplete.enableStreaming` | bool | `true` | 启用流式输出 |
| `aiTabComplete.contextLinesBefore` | number | `50` | 光标前上下文行数 |
| `aiTabComplete.contextLinesAfter` | number | `20` | 光标后上下文行数 |
| `aiTabComplete.streamListenerMaxFailures` | number | `3` | 流式监听器连续失败移除阈值 |

---

## Prompt 策略

三种 Prompt 格式对应不同 Provider：

- **Claude**: system prompt + 单条 user message，包含语言/前后上下文/当前行
- **OpenAI**: system + user messages JSON 格式
- **Ollama**: FIM 模式 `<PRE>...<SUF>...<MID>` 模板

上下文信息：`language`、`context_before`、`context_after`、`prefix`、`suffix`、`syntax_context`

---

## 跨平台构建

| 平台 | Target |
|------|--------|
| Windows x64 | `x86_64-pc-windows-msvc` |
| Linux x64 | `x86_64-unknown-linux-gnu` |
| macOS Intel | `x86_64-apple-darwin` |
| macOS ARM | `aarch64-apple-darwin` |

Release 构建启用 LTO + strip 优化体积。打 tag 自动触发 GitHub Actions 构建和发布。

---

## 性能目标

- 补全延迟: p95 < 500ms
- 缓存命中率: > 60%
- 内存占用: < 200MB

---

## 关键文件索引

| 文件 | 核心职责 |
|------|----------|
| `server/src/lsp/backend.rs` | LSP Backend + 请求路由 |
| `server/src/app/completion_service.rs` | 补全主逻辑编排 |
| `server/src/ai/mod.rs` | AIProvider trait 定义 + 工厂函数 |
| `server/src/ai/streaming.rs` | SSE 解析 (Claude/OpenAI) |
| `server/src/completion/context.rs` | 上下文收集 + 过滤 |
| `server/src/completion/language.rs` | 语言检测 |
| `server/src/completion/prompt.rs` | Prompt 模板构建 |
| `server/src/completion/filter.rs` | 补全结果后处理 |
| `server/src/cache/mod.rs` | 异步 LRU 缓存管理 |
| `server/src/config/mod.rs` | 配置加载 (文件>环境变量>默认) |
| `vscode-extension/src/extension.ts` | 扩展入口 |
| `vscode-extension/src/bootstrap/runtime/extension-runtime.ts` | 扩展运行时装配 |
| `vscode-extension/src/bootstrap/runtime/client-runtime.ts` | mock/LSP client 生命周期状态机 |
| `vscode-extension/src/core/completion-client/completion-client-router.ts` | client 门面 + 流式监听广播 |
| `vscode-extension/src/core/lsp/lsp-client.ts` | LSP 客户端封装 + 流式监听 |
| `vscode-extension/src/completion/provider.ts` | VS Code InlineCompletionItemProvider |
| `vscode-extension/src/completion/inline-completion-resolver.ts` | 请求解析、client cache、流式文本返回 |
| `vscode-extension/src/completion/stream-tracker.ts` | 当前活跃流状态 |
| `vscode-extension/package.json` | 扩展清单 + 配置定义 |
