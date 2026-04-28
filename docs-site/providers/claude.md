# Claude (Anthropic)

Claude 是默认 Provider，通过 Anthropic Messages API 提供高质量代码补全。

## 前提

1. 获取 [Anthropic API Key](https://console.anthropic.com/)
2. 确保网络可访问 `https://api.anthropic.com`

## 配置

### 方式一：配置文件

```toml
provider = "claude"
claude_api_key = "sk-ant-xxxxxxxxxxxxx"
claude_model = "claude-sonnet-4-20250514"
claude_api_base = "https://api.anthropic.com"  # 可选，默认值
```

### 方式二：环境变量

```bash
export ANTHROPIC_API_KEY="sk-ant-xxxxxxxxxxxxx"
```

启动 VS Code：

```bash
code .
```

### 方式三：VS Code 设置

```json
{
  "aiTabComplete.provider": "claude",
  "aiTabComplete.claude.model": "claude-sonnet-4-20250514"
}
```

## 支持的模型

| 模型 | 说明 |
|------|------|
| `claude-sonnet-4-20250514` | 推荐，性能与速度平衡 |
| `claude-haiku-4-5-20251001` | 最快，适合简单补全 |
| `claude-opus-4-7` | 最强，适合复杂代码 |

## Prompt 格式

Claude 使用 system + user 双段 prompt：

```
System: 你是一个代码补全助手，根据上下文生成代码...

User: Language: rust
Context before:
fn main() {
    let x = vec![1, 2, 3];
...
Context after:
...
Current line:
    let y = x.i
```

## 流式输出

支持 SSE 流式输出，逐 token 推送，首 token 延迟低。

## 代理设置

如果使用 Anthropic 兼容代理（如 One API）：

```toml
claude_api_base = "https://your-proxy.com"
```
