# 配置

AI Tab Complete 支持三级配置优先级：

```
配置文件 (.ai-tab-complete.toml) > 环境变量 > VS Code Settings > 默认值
```

高优先级配置覆盖低优先级。

## 配置文件（推荐）

在项目根目录或用户 Home 目录创建 `.ai-tab-complete.toml`：

```toml
provider = "claude"

# Claude API Key
claude_api_key = "sk-ant-xxxxx"

# 模型
claude_model = "claude-sonnet-4-20250514"

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

### 搜索路径

配置文件按以下顺序查找，**找到第一个即使用**：

```
./.ai-tab-complete.toml                 # 当前工作目录
~/.ai-tab-complete.toml                  # 用户 Home 目录
~/.config/ai-tab-complete/config.toml    # XDG 配置目录
```

::: warning 安全提示
包含 API Key 的配置文件不要提交到 Git。项目已默认将 `.ai-tab-complete.toml` 加入 `.gitignore`。
:::

## 环境变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `ANTHROPIC_API_KEY` | Claude API Key | `sk-ant-...` |
| `OPENAI_API_KEY` | OpenAI API Key | `sk-...` |
| `AI_TAB_COMPLETE_PROVIDER` | AI Provider | `claude` / `openai` / `ollama` |
| `AI_TAB_COMPLETE_MAX_TOKENS` | 最大 Token 数 | `256` |
| `AI_TAB_COMPLETE_DEBOUNCE_MS` | 防抖延迟(ms) | `150` |
| `AI_TAB_COMPLETE_STREAMING` | 启用流式 | `true` / `false` |

## VS Code 设置

在 VS Code 设置 (`Ctrl+,`) 中搜索 `AI Tab Complete`：

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `aiTabComplete.provider` | enum | `claude` | AI 提供商 |
| `aiTabComplete.claude.model` | string | `claude-sonnet-4-20250514` | Claude 模型 |
| `aiTabComplete.openai.model` | string | `gpt-4o` | OpenAI 模型 |
| `aiTabComplete.ollama.model` | string | `codellama` | Ollama 模型 |
| `aiTabComplete.debounceMs` | number | `150` | 防抖延迟 (50-1000ms) |
| `aiTabComplete.maxTokens` | number | `256` | 最大 Token 数 (16-4096) |
| `aiTabComplete.enableAutoCompletion` | boolean | `true` | 启用自动补全 |
| `aiTabComplete.enableStreaming` | boolean | `true` | 启用流式输出 |
| `aiTabComplete.contextLinesBefore` | number | `50` | 光标前上下文行数 (0-200) |
| `aiTabComplete.contextLinesAfter` | number | `20` | 光标后上下文行数 (0-100) |

## 配置示例

### 日常开发用 Claude

```toml
provider = "claude"
claude_api_key = "sk-ant-xxx"
claude_model = "claude-sonnet-4-20250514"
max_tokens = 256
enable_streaming = true
```

### 离线使用 Ollama

```toml
provider = "ollama"
ollama_model = "codellama"
ollama_api_base = "http://localhost:11434"
```

### 低延迟优先

```toml
max_tokens = 128
debounce_ms = 100
context_lines_before = 20
context_lines_after = 5
```
