# AI Tab Complete

AI 驱动的 VS Code 内联代码补全插件，支持 Claude / OpenAI / Ollama。

打字时自动生成幽灵文本补全建议，按 Tab 接受，Esc 取消。

## 功能

- **多 AI Provider 支持**：Claude、OpenAI、Ollama 本地模型，可随时切换
- **流式输出**：逐 token 接收补全结果，降低首 token 延迟
- **智能上下文**：自动收集光标前后的代码上下文，支持 20+ 语言
- **结果缓存**：LRU 缓存 + TTL 过期，避免重复请求
- **可配置**：Provider、模型、延迟、Token 数等均可自定义

## 架构

```
用户打字 → VS Code InlineCompletionProvider → LSP 请求
  → Rust LSP Server 收集上下文 → 调用 AI API → 流式推送通知
  → VS Code 显示幽灵文本 → Tab 接受 / Esc 取消
```

- **VS Code Extension** (`vscode-extension/`)：TypeScript，注册补全提供器，管理 LSP 客户端生命周期
- **LSP Server** (`server/`)：Rust + tower-lsp，处理补全请求、AI API 调用、缓存

## 前置要求

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://www.rust-lang.org/tools/install) >= 1.75
- [VS Code](https://code.visualstudio.com/) >= 1.82
- 至少一个 AI 服务的 API Key（Claude 或 OpenAI），或本地运行的 Ollama

## 开发运行

### 1. 编译 Rust LSP Server

```bash
cd server
cargo build --release
```

编译产物在 `server/target/release/ai-tab-complete-lsp`（Windows 为 `.exe`）。

### 2. 安装 VS Code 扩展依赖

```bash
cd vscode-extension
npm install
```

### 3. 编译 TypeScript

```bash
cd vscode-extension
npx tsc
```

### 4. 在 VS Code 中调试

1. 用 VS Code 打开项目根目录 `ai-tab-complete/`
2. 按 `F5` 启动调试（会自动编译 Rust + TypeScript，并打开 `vscode-extension/dev-fixture/` 这个测试工作区）
3. 开发宿主会自动打开 `sample.ts`，直接输入代码测试 Tab 接受补全；如果要测试别的项目，再在开发宿主里执行 `File > Open Folder...`

> 如果 F5 构建报错，可以手动先编译两端：
> ```bash
> # 终端 1：编译 Rust
> cd server && cargo build --release
> # 终端 2：编译 TS
> cd vscode-extension && npx tsc
> ```
> 然后在 VS Code 中按 F5。

## 配置

支持三种配置方式，按优先级从高到低：

| 优先级 | 方式 | 说明 |
|--------|------|------|
| 1 | 配置文件 | `.ai-tab-complete.toml`，可设置 API Key 等所有选项 |
| 2 | 环境变量 | `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` 等 |
| 3 | 默认值 | 内置默认配置 |

### 配置文件（推荐）

在项目根目录或用户 home 目录创建 `.ai-tab-complete.toml`：

```toml
# AI Provider 选择：claude / openai / ollama
provider = "claude"

# API Key（直接写在配置文件中，避免每次设置环境变量）
claude_api_key = "sk-ant-xxxxx"
# openai_api_key = "sk-xxxxx"

# 模型设置
claude_model = "claude-sonnet-4-20250514"
# openai_model = "gpt-4o"
# ollama_model = "codellama"

# API Base URL（使用代理或兼容接口时可修改）
# claude_api_base = "https://api.anthropic.com"
# openai_api_base = "https://api.openai.com"
# ollama_api_base = "http://localhost:11434"

# 补全参数
max_tokens = 256
debounce_ms = 150
enable_streaming = true
enable_auto_completion = true

# 上下文行数
context_lines_before = 50
context_lines_after = 20

# 缓存设置
cache_max_entries = 1000
cache_ttl_secs = 30
```

**配置文件查找路径**（按顺序，找到第一个即使用）：

```
./.ai-tab-complete.toml                          # 当前工作目录
~/.ai-tab-complete.toml                          # 用户 home 目录
~/.config/ai-tab-complete/config.toml            # XDG 配置目录
```

> **安全提示**：包含 API Key 的配置文件不要提交到 Git。建议在 `.gitignore` 中添加 `.ai-tab-complete.toml`。

### 环境变量

如果没有配置文件，也可以通过环境变量设置：

```bash
# API Key
export ANTHROPIC_API_KEY="sk-ant-..."     # Claude
export OPENAI_API_KEY="sk-..."            # OpenAI

# 通用配置（可选）
export AI_TAB_COMPLETE_PROVIDER="claude"   # claude / openai / ollama
export AI_TAB_COMPLETE_MAX_TOKENS="256"
export AI_TAB_COMPLETE_DEBOUNCE_MS="150"
export AI_TAB_COMPLETE_STREAMING="true"
```

然后从同一终端启动 VS Code：

```bash
code .
```

使用 Ollama 无需 API Key，确保本地已启动 Ollama 服务即可：

```bash
ollama serve
```

### VS Code 设置

在 VS Code 设置中搜索 `AI Tab Complete`，可调整运行时参数：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `aiTabComplete.provider` | `claude` | AI 提供商：`claude` / `openai` / `ollama` |
| `aiTabComplete.claude.model` | `claude-sonnet-4-20250514` | Claude 模型名称 |
| `aiTabComplete.openai.model` | `gpt-4o` | OpenAI 模型名称 |
| `aiTabComplete.ollama.model` | `codellama` | Ollama 模型名称 |
| `aiTabComplete.debounceMs` | `150` | 触发补全前的防抖延迟（ms） |
| `aiTabComplete.maxTokens` | `256` | 最大补全 Token 数 |
| `aiTabComplete.enableAutoCompletion` | `true` | 是否启用自动补全 |
| `aiTabComplete.enableStreaming` | `true` | 是否启用流式输出 |
| `aiTabComplete.contextLinesBefore` | `50` | 光标前上下文行数 |
| `aiTabComplete.contextLinesAfter` | `20` | 光标后上下文行数 |

## 命令

| 命令 | 快捷键 | 说明 |
|------|--------|------|
| `AI Tab Complete: 手动触发补全` | - | 手动触发一次补全 |
| `AI Tab Complete: 启用/禁用自动补全` | - | 切换自动补全开关 |
| `AI Tab Complete: 清除缓存` | - | 清除客户端和服务端缓存 |
| `AI Tab Complete: 重启服务` | - | 重启 LSP Server |

## 项目结构

```
ai-tab-complete/
├── server/                  # Rust LSP Server
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs              # 入口
│       ├── lsp/backend.rs       # LSP Backend
│       ├── protocol.rs          # 自定义协议
│       ├── ai/                  # AI Provider 适配器
│       │   ├── claude.rs
│       │   ├── openai.rs
│       │   ├── ollama.rs
│       │   └── streaming.rs     # SSE 流式解析
│       ├── completion/          # 补全逻辑
│       │   ├── context.rs       # 上下文收集
│       │   ├── prompt.rs        # Prompt 模板
│       │   └── filter.rs        # 结果后处理
│       ├── cache/               # LRU 缓存
│       └── config/              # 配置管理
│
├── vscode-extension/            # VS Code TypeScript 扩展
│   ├── package.json
│   └── src/
│       ├── extension.ts         # 入口
│       ├── lsp/                 # LSP 客户端
│       ├── completion/          # 补全提供器
│       ├── config/              # 设置管理
│       └── status/              # 状态栏
│
├── .vscode/                     # VS Code 调试配置
│   ├── launch.json
│   └── tasks.json
└── README.md
```

## License

MIT
