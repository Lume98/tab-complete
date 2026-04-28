# AI Tab Complete — Agent Instructions

## 项目约定
- 中文沟通，代码用英文
- 先建模后动手，改动前理清数据流、边界条件、状态机
- 每次改动需指出设计漏洞、边界条件、隐性耦合
- 简洁输出，不写过度注释和文档

## 技术文档
详细架构设计见 @docs/architecture.md

## 关键文件速查

| 文件 | 职责 |
|------|------|
| `server/src/server.rs` | LSP Backend + 补全主逻辑 |
| `server/src/ai/mod.rs` | AIProvider trait + 工厂函数 |
| `server/src/ai/streaming.rs` | SSE 解析 (Claude/OpenAI) |
| `server/src/completion/context.rs` | 上下文收集 + 过滤 |
| `server/src/completion/prompt.rs` | Prompt 模板 |
| `server/src/completion/filter.rs` | 补全后处理 |
| `server/src/cache/mod.rs` | 异步 LRU 缓存 |
| `server/src/config/mod.rs` | 配置加载 |
| `vscode-extension/src/extension.ts` | 扩展入口 + 命令注册 |
| `vscode-extension/src/completion/provider.ts` | InlineCompletionItemProvider |
| `vscode-extension/src/lsp/client.ts` | LSP 客户端封装 |
| `vscode-extension/src/lsp/server-manager.ts` | 二进制路径解析 |
| `vscode-extension/package.json` | 扩展清单 + 配置定义 |

## 关键设计决策
- Provider 工厂模式：通过 `create_provider(ProviderType, config)` 运行时切换 AI Provider
- 配置优先级：`.ai-tab-complete.toml > 环境变量 > VS Code Settings > 默认值`
- 双端缓存：ClientCache (100 条目, 5s TTL) + LruCache (1000 条目, 300s TTL)
