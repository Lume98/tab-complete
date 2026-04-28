#!/usr/bin/env bash
# AI Tab Complete - 构建脚本
# 用法: ./scripts/build.sh [--release]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_TYPE="${1:-release}"

echo "=== AI Tab Complete Build ==="
echo "Root: $ROOT_DIR"
echo "Type: $BUILD_TYPE"
echo ""

# 1. 编译 Rust LSP Server
echo "[1/4] Compiling Rust LSP Server..."
cd "$ROOT_DIR/lsp-server"
if [ "$BUILD_TYPE" = "release" ]; then
    cargo build --release
    BINARY_DIR="target/release"
else
    cargo build
    BINARY_DIR="target/debug"
fi
echo "  -> Done: lsp-server/$BINARY_DIR/"
echo ""

# 2. 复制二进制到扩展目录
echo "[2/4] Copying binary to extension..."
PLATFORM="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$PLATFORM" in
    linux)   PLATFORM_NAME="linux" ;;
    darwin)  PLATFORM_NAME="darwin" ;;
    mingw*|msys*|cygwin*|windows_nt) PLATFORM_NAME="win32" ;;
    *)       PLATFORM_NAME="$PLATFORM" ;;
esac
case "$ARCH" in
    x86_64|amd64)  ARCH_NAME="x64" ;;
    aarch64|arm64) ARCH_NAME="arm64" ;;
    *)             ARCH_NAME="$ARCH" ;;
esac

TARGET_DIR="$ROOT_DIR/vscode-extension/lsp-bin/${PLATFORM_NAME}-${ARCH_NAME}"
mkdir -p "$TARGET_DIR"

if [ "$PLATFORM_NAME" = "win32" ]; then
    BINARY_NAME="ai-tab-complete-lsp.exe"
else
    BINARY_NAME="ai-tab-complete-lsp"
fi

cp "$ROOT_DIR/lsp-server/$BINARY_DIR/$BINARY_NAME" "$TARGET_DIR/"
chmod +x "$TARGET_DIR/$BINARY_NAME" 2>/dev/null || true
echo "  -> Copied to: lsp-bin/${PLATFORM_NAME}-${ARCH_NAME}/$BINARY_NAME"
echo ""

# 3. 安装 npm 依赖并编译 TypeScript
echo "[3/4] Building VS Code Extension..."
cd "$ROOT_DIR/vscode-extension"
if [ ! -d "node_modules" ]; then
    npm install
fi
npx tsc
echo "  -> Done"
echo ""

# 4. 打包 vsix
echo "[4/4] Packaging .vsix..."
if command -v vsce &> /dev/null; then
    vsce package --out "$ROOT_DIR/"
    echo "  -> Done: .vsix file created in project root"
elif command -npx &> /dev/null; then
    npx @vscode/vsce package --out "$ROOT_DIR/"
    echo "  -> Done: .vsix file created in project root"
else
    echo "  -> SKIP: vsce not found. Install with: npm install -g @vscode/vsce"
    echo "     Then run: cd vscode-extension && vsce package"
fi

echo ""
echo "=== Build Complete ==="
