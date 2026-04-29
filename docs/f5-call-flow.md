# F5 调试启动完整调用流程

## 阶段 1: 预构建 (preLaunchTask: "Build All")

```
F5 按下
  └─ launch.json → preLaunchTask: "Build All"
       ├─ [并行] Build Rust LSP
       │    └─ cd server && cargo build --release
       │         → 输出: server/target/release/ai-tab-complete-lsp.exe
       │
       └─ [并行] Build VS Code Extension
            └─ cd vscode-extension && npm run compile
                 → tsc -p ./   (TypeScript 编译 → out/ 目录)
```

## 阶段 2: 启动 Extension Development Host

```
VS Code 启动新的"扩展开发宿主"窗口
  └─ 参数: --extensionDevelopmentPath=.../vscode-extension
  └─ 加载 vscode-extension/package.json
       └─ activationEvents: ["onStartupFinished"]
       └─ main: "./out/extension.js"
```

## 阶段 3: 扩展激活 (`activate()`)

```
extension.ts:activate()
  │
  ├─ 1. new Settings()                    → 读取 VS Code 配置
  ├─ 2. statusBar.showInitializing()      → 状态栏显示"初始化中"
  │
  ├─ 3. startLspServer(context)
  │    └─ new LspClient(context)
  │         └─ new ServerManager(context)
  │    └─ lspClient.start()
  │         ├─ serverManager.resolveBinaryPath()
  │         │    ├─ 1) 环境变量 AI_TAB_COMPLETE_LSP_PATH → 开发模式
  │         │    │      通常指向: server/target/release/ai-tab-complete-lsp.exe
  │         │    ├─ 2) lsp-bin/{platform}/  (打包二进制, 不存在则跳过)
  │         │    └─ 3) cargo build 产物     (fallback)
  │         │
  │         ├─ new LanguageClient('aiTabComplete', ...)
  │         │    ├─ serverOptions: 启动 Rust 二进制，arg: --stdio
  │         │    ├─ initializationOptions: { config: VS Code 配置 }
  │         │    └─ 注册通知监听: custom/inlineCompletionUpdate
  │         │
  │         └─ client.start()
  │              └─ 子进程启动 Rust LSP Server (stdio 管道通信)
  │                   │
  │                   └─ Rust main.rs 启动
  │                        ├─ 初始化 tracing (日志)
  │                        ├─ AppConfig::load()        → 加载配置
  │                        ├─ create_provider_from_config()
  │                        │    → ClaudeProvider / OpenAIProvider / OllamaProvider
  │                        ├─ CacheManager::new(1000, 30)  → 1000条, 30分钟TTL
  │                        ├─ LspService::build(Backend)
  │                        │    └─ 注册自定义方法:
  │                        │         textDocument/inlineCompletion
  │                        └─ Server::serve() → 开始等待请求
  │
  ├─ 4. 注册 InlineCompletionItemProvider (全局 ** 模式)
  │    └─ new AIInlineCompletionProvider(lspClient, settings)
  │         ├─ Debouncer(150ms)
  │         ├─ ClientCache(100, 5000)        → 100条, 5秒TTL
  │         └─ 监听流式更新回调 (lspClient.onStreamUpdate)
  │
  ├─ 5. 注册 3 个命令
  │    ├─ aiTabComplete.trigger   → 手动触发补全
  │    ├─ aiTabComplete.toggle    → 启用/禁用
  │    └─ aiTabComplete.clearCache → 清除缓存
  │
  └─ 6. 创建 OutputChannel + 完成日志
```

## 阶段 4: 用户输入时补全流程

```
用户输入字符
  │
  └─ VS Code 调用 AIInlineCompletionItemProvider.provideInlineCompletionItems()
       │
       ├─ 1. 检查 enableAutoCompletion 是否启用
       ├─ 2. 检查 CancellationToken 是否已被取消
       │
       ├─ 3. Debouncer.wait(token) → 等待 150ms 防抖
       │    └─ 期间有新的输入 → CancellationToken 取消 → 返回 false → 终止
       │
       ├─ 4. 构建 cache key: uri:line:prefix
       ├─ 5. ClientCache.get(cacheKey)
       │    └─ 命中 → 直接返回缓存结果 (无 LSP 通信)
       │
       ├─ 6. lspClient.requestInlineCompletion(params)
       │    └─ LSP 请求 → textDocument/inlineCompletion (通过 stdio)
       │         │
       │         └─ Rust Backend::handle_inline_completion()
       │              ├─ a. 读取文档内容 (内存中的 DocumentsState)
       │              ├─ b. detect_language(uri) → 文件扩展名 → 语言名
       │              ├─ c. ContextCollector.collect() → 采集 prefix/suffix/上下文
       │              ├─ d. should_complete() → 检查是否应触发 (空行/注释等过滤)
       │              ├─ e. build_cache_key() → 前缀哈希 key
       │              ├─ f. CacheManager.get() → LRU 缓存查找 (1000条/30分钟TTL)
       │              │
       │              ├─ g. [流式模式, enableStreaming=true]
       │              │    ├─ provider.stream_completion(request, max_tokens)
       │              │    ├─ tokio::spawn 后台解析 SSE
       │              │    ├─ 每收到一个 token:
       │              │    │    └─ client.send_notification("custom/inlineCompletionUpdate")
       │              │    │         → TS端 streamUpdateCallback → 刷新幽灵文本
       │              │    ├─ filter::filter_completion() → 后处理
       │              │    └─ filter::truncate_completion() → 截断 (20行/512字符)
       │              │
       │              └─ h. [非流式模式, 或流式失败时的 fallback]
       │                   ├─ RetryStrategy.retry() → 指数退避 (最多2次/500ms延迟)
       │                   ├─ provider.complete()
       │                   ├─ filter + truncate
       │                   └─ 写入 Rust CacheManager
       │
       ├─ 7. 提取第一个 InlineCompletionItem
       ├─ 8. 写入 ClientCache
       └─ 9. 返回 InlineCompletionItem 列表
            └─ VS Code 渲染幽灵文本 (inline suggestion)
```

## 阶段 5: 用户交互

```
Tab 按下 (inlineCompletionVisible && !suggestWidgetVisible)
  └─ aiTabComplete.accept → 接受补全文本

Esc 按下 (inlineCompletionVisible)
  └─ aiTabComplete.dismiss → 取消幽灵文本
```

## 阶段 6: 停用 (`deactivate()`)

```
VSCode 窗口关闭 / 扩展被禁用
  └─ extension.ts:deactivate()
       ├─ lspClient.stop() → 发送 shutdown 通知 → 终止子进程
       └─ statusBar.dispose()
```

## 关键设计要点

- **双进程架构**: TS 扩展进程 + Rust LSP 子进程，通过 stdio JSON-RPC 通信
- **三级防御**: Debouncer (150ms 防抖) → ClientCache (5s TTL) → Rust CacheManager (30min TTL)
- **流式推送**: Rust 端每收到一个 token 就通过 `custom/inlineCompletionUpdate` 通知推送到 TS 端，TS 端持有 `currentStreamText` 刷新幽灵文本
- **防抖保护**: 用户连续输入时，每次按键都会取消前一个补全请求的 CancellationToken
