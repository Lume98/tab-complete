# AI Tab Complete — 技术文档

## 架构概览

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

双语言架构：TypeScript 负责 VS Code 集成，Rust 负责补全逻辑和 AI API 调用。通过 LSP stdio 协议通信。

---

## 数据流

```
用户打字
  → Debouncer (150ms)
  → ClientCache 检查
  → LSP textDocument/inlineCompletion 请求
  → Backend::handle_inline_completion()
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

流式模式：Rust 端 `tokio::spawn` 后台解析 SSE，通过 `custom/inlineCompletionUpdate` 通知推送到客户端，客户端监听并刷新幽灵文本。

---

## 项目结构

```
ai-tab-complete/
├── lsp-server/                      # Rust LSP Server
│   ├── Cargo.toml                   # tower-lsp 0.20, tokio, reqwest, tiktoken-rs
│   └── src/
│       ├── main.rs                  # 入口：初始化配置、创建 Provider、启动 LspService
│       ├── server.rs                # Backend：LSP 生命周期 + 补全核心逻辑
│       ├── protocol.rs              # 自定义协议类型
│       ├── ai/
│       │   ├── mod.rs               # AIProvider trait + 工厂函数
│       │   ├── claude.rs            # Anthropic Messages API (SSE 流式)
│       │   ├── openai.rs            # OpenAI Chat Completions API
│       │   ├── ollama.rs            # Ollama /api/generate (本地模型)
│       │   ├── streaming.rs         # SSE 解析器 (Claude/OpenAI 格式)
│       │   └── retry.rs             # 指数退避重试 (最多 2 次, 500ms 基础延迟)
│       ├── completion/
│       │   ├── context.rs           # 上下文收集 + CompletionRequest
│       │   ├── handler.rs           # 独立补全处理器 (备用)
│       │   ├── prompt.rs            # Prompt 模板 (Claude/OpenAI/Ollama FIM)
│       │   └── filter.rs            # 后处理：去 markdown、截断 (20行/512字符)
│       ├── cache/
│       │   ├── mod.rs               # CacheManager (异步 Mutex + LruCache)
│       │   └── lru.rs               # LRU 实现 (HashMap + TTL + 淘汰)
│       └── config/
│           ├── mod.rs               # AppConfig (16 字段, 配置文件>环境变量>默认值)
│           └── env.rs               # API Key 环境变量 + mask_api_key() 脱敏
│
├── vscode-extension/                # VS Code Extension
│   ├── package.json                 # 引擎 ^1.116.0, 9 配置项, 3 命令, 2 快捷键
│   ├── src/
│   │   ├── extension.ts             # 入口：激活、注册命令/Provider、启动 LSP
│   │   ├── lsp/
│   │   │   ├── client.ts            # LspClient 封装 (请求/流式监听/缓存清理)
│   │   │   ├── protocol.ts          # TS 侧协议类型
│   │   │   └── server-manager.ts    # 二进制路径解析 (环境变量>内置>cargo)
│   │   ├── completion/
│   │   │   ├── provider.ts          # AIInlineCompletionItemProvider
│   │   │   ├── cache.ts             # ClientCache (LRU, 100 条目, 5s TTL)
│   │   │   ├── debounce.ts          # Debouncer (150ms, CancellationToken)
│   │   │   └── telemetry.ts         # 本地遥测 (接受率/延迟, 不上报)
│   │   ├── config/settings.ts       # VS Code 配置读写 (aiTabComplete.*)
│   │   ├── commands/
│   │   │   ├── accept.ts            # Tab 接受
│   │   │   └── dismiss.ts           # Esc 取消
│   │   └── status/status-bar.ts     # 状态栏 (initializing/ready/error/disabled)
│   └── lsp-bin/                     # 预编译二进制 (按平台)
│
├── scripts/                         # build.sh / build.ps1
└── .github/workflows/release.yml    # 4 平台 CI/CD (win/linux/mac)
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

---

## 双端缓存设计

| 层级 | 位置 | 容量 | TTL | Key |
|------|------|------|-----|-----|
| ClientCache | TS Provider | 100 条目 | 5s | prefix + position |
| LruCache | Rust CacheManager | 1000 条目 | 300s | prefix-hash + language |

文档变更（did_change）时自动失效对应缓存。

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
| `aiTabComplete.model` | string | provider 默认 | 模型名称 |
| `aiTabComplete.debounceMs` | number | `150` | 防抖延迟 |
| `aiTabComplete.maxTokens` | number | `256` | 最大补全 token 数 |
| `aiTabComplete.contextLines` | number | `50` | 上下文行数 |
| `aiTabComplete.enableStreaming` | bool | `true` | 启用流式输出 |
| `aiTabComplete.ollamaEndpoint` | string | `http://localhost:11434` | Ollama 地址 |
| `aiTabComplete.cacheEnabled` | bool | `true` | 启用缓存 |
| `aiTabComplete.autoTrigger` | bool | `true` | 自动触发 |

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
| `lsp-server/src/server.rs` | LSP Backend + 补全主逻辑 + 语言检测 (25+ 语言) |
| `lsp-server/src/ai/mod.rs` | AIProvider trait 定义 + 工厂函数 |
| `lsp-server/src/ai/streaming.rs` | SSE 解析 (Claude/OpenAI) |
| `lsp-server/src/completion/context.rs` | 上下文收集 + 过滤 |
| `lsp-server/src/completion/prompt.rs` | Prompt 模板构建 |
| `lsp-server/src/completion/filter.rs` | 补全结果后处理 |
| `lsp-server/src/cache/mod.rs` | 异步 LRU 缓存管理 |
| `lsp-server/src/config/mod.rs` | 配置加载 (文件>环境变量>默认) |
| `vscode-extension/src/extension.ts` | 扩展入口 + 命令注册 |
| `vscode-extension/src/completion/provider.ts` | VS Code InlineCompletionItemProvider |
| `vscode-extension/src/lsp/client.ts` | LSP 客户端封装 + 流式监听 |
| `vscode-extension/package.json` | 扩展清单 + 配置定义 |
