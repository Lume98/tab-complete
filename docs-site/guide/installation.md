# 安装

## VS Code 扩展市场

::: tip 推荐
扩展市场安装是最简单的方式，会自动处理依赖和更新。
:::

1. 打开 VS Code
2. 按 `Ctrl+Shift+X` 打开扩展面板
3. 搜索 `AI Tab Complete`
4. 点击 **安装**

## 手动安装

### 从 Releases 下载

1. 访问 [GitHub Releases](https://github.com/your-username/ai-tab-complete/releases)
2. 下载对应平台的 `.vsix` 文件
3. 在 VS Code 中安装：

```bash
code --install-extension ai-tab-complete-0.1.0.vsix
```

或在 VS Code 中：
1. 打开扩展面板 (`Ctrl+Shift+X`)
2. 点击 `...` → **从 VSIX 安装**
3. 选择下载的 `.vsix` 文件

## 从源码构建

### 1. 编译 Rust LSP Server

```bash
cd server
cargo build --release
```

编译产物：`server/target/release/ai-tab-complete-lsp`（Windows 为 `.exe`）

### 2. 安装扩展依赖

```bash
cd vscode-extension
npm install
npx tsc
```

### 3. 调试运行

1. 用 VS Code 打开项目根目录
2. 按 `F5` 启动 Extension Development Host
3. 在新窗口中打开代码文件即可测试

## 平台支持

| 平台 | 架构 | 状态 |
|------|------|------|
| Windows | x86_64 | ✅ 支持 |
| Linux | x86_64 | ✅ 支持 |
| macOS | Intel | ✅ 支持 |
| macOS | Apple Silicon | ✅ 支持 |
