# Ollama（本地模型）

使用本地 Ollama 运行开源代码模型，无需网络，无需 API Key，数据完全本地。

## 前提

1. 安装 [Ollama](https://ollama.com/)
2. 拉取代码模型：

```bash
ollama pull codellama:7b
# 或其他模型
ollama pull deepseek-coder:6.7b
ollama pull starcoder2:7b
```

3. 确保 Ollama 服务运行中：

```bash
ollama serve
```

## 配置

### 配置文件

```toml
provider = "ollama"
ollama_model = "codellama"
ollama_api_base = "http://localhost:11434"  # 可选，默认值
```

### VS Code 设置

```json
{
  "aiTabComplete.provider": "ollama",
  "aiTabComplete.ollama.model": "codellama"
}
```

## 推荐模型

| 模型 | 大小 | 说明 |
|------|------|------|
| `codellama:7b` | ~4GB | Meta 代码专用模型，推荐 |
| `codellama:13b` | ~8GB | 更高精度，需要更多显存 |
| `deepseek-coder:6.7b` | ~4GB | DeepSeek 代码模型，质量好 |
| `starcoder2:7b` | ~4GB | BigCode 开源模型 |

## FIM 模式

Ollama 使用 Fill-in-the-Middle (FIM) prompt 格式：

```
<PRE>fn main() {
    let x = vec![1, 2, 3];
    <SUF>}
<MID>    let y = x.i
```

支持 FIM 的模型会原生利用光标前后上下文，补全更精准。

## 性能

- **首 token 延迟**：取决于本地硬件，通常在 100-500ms
- **模型加载**：首次请求需要加载模型（冷启动），后续请求直接推理
- **建议**：16GB+ 内存，有 GPU 更佳

## 限制

- 不支持流式输出（Ollama generate API 限制）
- 补全质量取决于模型能力和本地硬件
