# 日常使用

## 基本操作

| 操作 | 快捷键 | 说明 |
|------|--------|------|
| 触发补全 | 自动（输入即触发） | 150ms 防抖后自动请求补全 |
| 接受补全 | `Tab` | 接受当前补全建议 |
| 取消补全 | `Esc` | 取消当前补全建议 |
| 手动触发 | - | 通过命令面板执行 `AI Tab Complete: 手动触发补全` |

## 命令

通过 `Ctrl+Shift+P` 打开命令面板，输入 `AI Tab Complete`：

| 命令 | 说明 |
|------|------|
| `AI Tab Complete: 手动触发补全` | 手动触发一次补全 |
| `AI Tab Complete: 启用/禁用自动补全` | 切换自动补全开关 |
| `AI Tab Complete: 清除缓存` | 清除客户端和服务端缓存 |
| `AI Tab Complete: 重启服务` | 重启 LSP Server |

## 状态栏

状态栏显示当前补全状态：

| 状态 | 图标 | 说明 |
|------|------|------|
| `initializing` | ⏳ | 正在初始化 LSP Server |
| `ready` | ✅ | 就绪，可正常补全 |
| `error` | ❌ | 服务异常，点击查看错误 |
| `disabled` | 🔒 | 已禁用自动补全 |

## 支持的语言

支持 20+ 主流编程语言，自动检测文件类型：

TypeScript、JavaScript、Python、Rust、Go、Java、C、C++、C#、Ruby、PHP、Swift、Kotlin、Scala、Lua、Shell、SQL、HTML、CSS、JSON、YAML、Markdown 等。

## 小技巧

### 提升补全质量

- **写注释**：在上方写一行注释描述你要做什么，AI 会参考注释生成代码
- **写函数签名**：先写好函数名和参数，AI 会补全函数体
- **上下文充足**：避免在一个几乎空白的文件中期待高质量补全

### 性能优化

- **降低上下文行数**：如果补全延迟较高，适当减小 `contextLinesBefore` / `contextLinesAfter`
- **关闭流式输出**：网络较慢时可以关掉流式输出，减少请求次数
- **使用缓存**：缓存命中可直接返回结果，延迟 < 5ms
