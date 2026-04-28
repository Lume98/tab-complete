# OpenAI

通过 OpenAI Chat Completions API 提供代码补全。

## 前提

1. 获取 [OpenAI API Key](https://platform.openai.com/api-keys)
2. 确保网络可访问 `https://api.openai.com`

## 配置

### 方式一：配置文件

```toml
provider = "openai"
openai_api_key = "sk-xxxxxxxxxxxxx"
openai_model = "gpt-4o"
openai_api_base = "https://api.openai.com"  # 可选，默认值
```

### 方式二：环境变量

```bash
export OPENAI_API_KEY="sk-xxxxxxxxxxxxx"
```

### 方式三：VS Code 设置

```json
{
  "aiTabComplete.provider": "openai",
  "aiTabComplete.openai.model": "gpt-4o"
}
```

## 支持的模型

| 模型 | 说明 |
|------|------|
| `gpt-4o` | 推荐，质量与速度平衡 |
| `gpt-4o-mini` | 最快，成本最低 |
| `gpt-4-turbo` | 高质量，较慢 |

::: tip 兼容接口
任何兼容 OpenAI Chat Completions API 的服务都可以通过 `openai_api_base` 指向：
- Azure OpenAI
- GitHub Models
- 第三方代理（如 One API、AIHubMix）
:::

## 使用自定义兼容接口

```toml
provider = "openai"
openai_api_base = "https://your-endpoint.openai.azure.com"
openai_api_key = "your-key"
openai_model = "gpt-4o"
```
