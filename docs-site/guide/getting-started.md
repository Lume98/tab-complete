# 快速开始

5 分钟内在 VS Code 中启用 AI 代码补全。

## 前置要求

- [VS Code](https://code.visualstudio.com/) >= 1.82
- [Node.js](https://nodejs.org/) >= 18
- 至少一个 AI 服务的 API Key，或本地 Ollama

## 安装

### VS Code 扩展市场（推荐）

1. 在 VS Code 中搜索 `AI Tab Complete`
2. 点击安装
3. 设置 API Key（见下方）

### 手动安装 (.vsix)

```bash
# 下载 .vsix 文件后
code --install-extension ai-tab-complete-0.1.0.vsix
```

## 配置 API Key

选择你使用的 AI 服务，设置对应的 API Key：

### Claude (Anthropic)

```bash
# 环境变量
export ANTHROPIC_API_KEY="sk-ant-xxxxxxxxxxxxx"
```

或在项目根目录创建 `.ai-tab-complete.toml`：

```toml
provider = "claude"
claude_api_key = "sk-ant-xxxxxxxxxxxxx"
```

### OpenAI

```bash
export OPENAI_API_KEY="sk-xxxxxxxxxxxxx"
```

### Ollama（本地，无需 API Key）

```bash
ollama pull codellama
ollama serve
```

详细配置见 [配置指南](/guide/configuration)。

## 开始使用

1. 用 VS Code 打开任意项目
2. 打开代码文件开始输入
3. 稍等 150ms，补全建议自动出现（灰色斜体文本）
4. `Tab` 接受，`Esc` 取消

## 下一步

- [完整配置选项](/guide/configuration)
- [各 Provider 详细设置](/providers/)
- [架构设计](/architecture/overview)
