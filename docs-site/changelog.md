# 更新日志

## [0.1.0] - 2024-04-28

### 新增

- AI 驱动的内联代码补全（幽灵文本）
- 支持 Claude / OpenAI / Ollama 三种 Provider
- 流式输出（逐 token 接收，降低首 token 延迟）
- 智能上下文收集（识别 20+ 编程语言）
- LRU 缓存 + TTL 过期（避免重复请求）
- VS Code 配置联动（运行时动态切换 Provider 和参数）
- 状态栏指示器（显示当前状态）
- 手动触发 / 启用禁用 / 清除缓存命令
- `.ai-tab-complete.toml` 配置文件支持
- 环境变量配置支持
