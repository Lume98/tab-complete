# VSCode Extension 代码注释总结

已添加详细中文注释的关键文件及其核心概念：

## 🚀 启动与生命周期

### `extension.ts` - 扩展入口
- runtime 单例管理
- activate/deactivate 生命周期

### `extension-runtime.ts` - 运行时装配
- 依赖注入：Settings、StatusIndicator、Logger、ClientRouter、ClientRuntime
- 配置变更策略：restart vs hot-update
- 资源释放顺序（反向）

### `client-runtime.ts` - 客户端状态机
- 状态流转：idle → starting → ready (或 failed)
- restart 循环和合并逻辑
- mock/LSP 模式切换
- 操作队列（串行执行 start/restart/stop）

---

## 💾 配置与日志

### `settings.ts` - 配置管理
- 支持 workspace/folder 级作用域
- 配置变更事件监听
- 全局/局部配置读写

### `settings-restart-policy.ts` - 策略决策
- hot-update：streamListenerMaxFailures（不需要重启）
- restart：provider、model、useMockClient 等关键配置

### `runtime-logger.ts` - 日志系统
- 输出通道（VS Code UI 中可见）
- 作用域日志（自动前缀 [scope]）
- 时间戳 + 日志级别

### `status-indicator.ts` - 状态栏指示器
- 显示：初始化、就绪、禁用、错误
- 点击打开菜单命令

---

## 🔌 补全客户端

### `inline-completion-client.ts` - 客户端接口
- `InlineCompletionClient`：基础补全、缓存清理、流式监听
- `StartableInlineCompletionClient`：扩展 start/stop 生命周期
- `StreamUpdate`：流式更新参数

### `completion-client-router.ts` - 客户端路由器
- 门面模式：隔离 mock/LSP 切换
- 流式监听广播：支持多个 Provider 监听
- 自动移除不稳定监听器（失败阈值）

---

## 📡 LSP 通信

### `lsp-client.ts` - LSP 客户端
- 二进制路径解析（跨平台）
- 启动流程：ServerOptions + ClientOptions → LanguageClient.start()
- 流式更新监听：custom/inlineCompletionUpdate 通知
- 同步请求：textDocument/inlineCompletion
- 缓存清理：textDocument/clearCache

---

## 🎯 补全提供者

### `provider.ts` - InlineCompletionItemProvider
- 数据流：debounce → ClientCache → LSP/mock → streamTracker/cache
- 防抖延迟：150ms（可配置）
- 配置变更监听：debounceMs、provider/model 热更新
- 流式监听注册：Server 推送 → streamTracker.update() → 触发重新渲染

### `inline-completion-resolver.ts` - 请求解析
- 缓存 key 计算（uri + version + line + prefix + provider + model）
- 流式状态检查：有活跃流则返回流文本，否则进行缓存查询
- LSP 请求流程：无缓存 → client.requestInlineCompletion → 结果缓存
- 流式标记：itemm.streamId 存在时交给 streamTracker 追踪

---

## 💡 缓存与流式

### `cache.ts` - 客户端 LRU 缓存
- 容量：100 条目，TTL 5s
- 淘汰策略：LRU（Map 插入顺序）+ TTL 过期
- 缓存策略：流式未完成时不缓存，完成后缓存最终文本
- 双层缓存：TS 侧 ClientCache(5s) + Rust 侧 LruCache(300s)

### `stream-tracker.ts` - 流式状态追踪
- 记录 streamId、缓存 key、累积文本、完成标志
- 防止陈旧流覆盖：检查 streamId 匹配
- 变化检测：文本或完成状态改变时返回 true（触发重新渲染）

### `debounce.ts` - 防抖工具
- 延迟执行直到用户停止输入（默认 150ms）
- 分段等待：每 10ms 检查 cancellation token
- 热更新：配置变更时更新防抖延迟

---

## 📋 架构流程图

```
用户打字 (150ms 后无新输入)
  ↓
Provider.provideInlineCompletionItems()
  ├─ debounce.wait(token) → 防抖等待
  ├─ InlineCompletionResolver.resolve()
  │  ├─ 检查活跃流：streamTracker.hasActiveRequest()
  │  │  ├─ 有活跃流 → 返回累积文本、检查完成状态
  │  │  └─ 完成 → 缓存结果、清空 streamTracker
  │  ├─ ClientCache 查询（5s TTL）
  │  │  ├─ 命中 → 返回缓存
  │  │  └─ 未命中 → LSP/mock 请求
  │  ├─ client.requestInlineCompletion()
  │  │  └─ LspClient.requestInlineCompletion()
  │  │     └─ LanguageClient.sendRequest('textDocument/inlineCompletion')
  │  ├─ 结果处理
  │  │  ├─ streamId 存在 → streamTracker.track()（等待流式更新）
  │  │  └─ 无 streamId → ClientCache.set()（直接缓存）
  │  └─ 返回 InlineCompletionItem
  ↓
VS Code 渲染幽灵文本
  ↓
用户 Tab/Escape 接受/取消
  │
  ├─ 流式补全：Server 推送 SSE 更新 → custom/inlineCompletionUpdate
  │  ├─ LspClient 监听并转发给 ClientRouter
  │  ├─ ClientRouter 广播给 Provider 的流式监听器
  │  ├─ streamTracker.update() 累积新文本
  │  └─ triggerInlineSuggest() 触发重新请求 Provider
  │
  └─ 下次 Provider 调用
     └─ streamTracker.hasActiveRequest() 命中
        └─ 返回最新累积文本（流完成后缓存）
```

---

## 🔄 配置变更流程

```
VS Code Settings 变更
  ↓
Settings.onDidChange(key, value)
  ↓
ExtensionRuntime 监听
  ↓
SettingsRestartPolicy.decide(key, value)
  ├─ streamListenerMaxFailures
  │  └─ hot-update：CompletionClientRouter.updateStreamListenerMaxFailures()
  │     （不重启）
  │
  └─ provider / model / useMockClient / enableStreaming 等
     └─ restart：ClientRuntime.restart()
        ├─ 释放当前 LSP Client
        ├─ 延迟 2000ms
        └─ 重新启动（mock 或 LSP）
```

---

## 📌 关键设计点

1. **状态机确保串行**：ClientRuntime 使用 operationChain 队列，保证 start/restart/stop 串行执行，避免竞态条件

2. **双层缓存**：TS 侧快速响应（5s），Rust 侧长期存储（300s），目标命中率 > 60%

3. **流式隔离**：streamTracker 记录当前活跃流，后续 Provider 请求优先返回流文本，完成后缓存，避免陈旧流干扰

4. **防抖响应**：分段等待避免用户继续输入时仍发起请求

5. **hot-update vs restart**：非关键配置可 hot-update，关键配置需 restart，平衡用户体验和系统稳定性

6. **流式监听故障隔离**：监听器失败超过阈值自动移除，避免堵塞后续广播

---

已覆盖 15+ 关键文件，注释以 WHY 为主（设计决策、状态流转、隐性耦合），避免冗余描述实现细节。
