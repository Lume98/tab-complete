# AI Tab Complete - Windows Build Script
# 用法: .\scripts\build.ps1 [-Debug]

param(
    [switch]$Debug
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host "=== AI Tab Complete Build ===" -ForegroundColor Cyan
Write-Host "Root: $RootDir"
Write-Host ""

# 1. Compile Rust LSP Server
Write-Host "[1/4] Compiling Rust LSP Server..." -ForegroundColor Yellow
Set-Location "$RootDir\lsp-server"
if ($Debug) {
    cargo build
    $BinaryDir = "target\debug"
} else {
    cargo build --release
    $BinaryDir = "target\release"
}
Write-Host "  -> Done: lsp-server\$BinaryDir\" -ForegroundColor Green
Write-Host ""

# 2. Copy binary to extension directory
Write-Host "[2/4] Copying binary to extension..." -ForegroundColor Yellow
$ArchName = if ([System.Environment]::Is64BitOperatingSystem) { "x64" } else { "arm64" }
$PlatformDir = "win32-$ArchName"
$TargetDir = "$RootDir\vscode-extension\lsp-bin\$PlatformDir"
New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null

$BinaryName = "ai-tab-complete-lsp.exe"
Copy-Item "$RootDir\lsp-server\$BinaryDir\$BinaryName" "$TargetDir\" -Force
Write-Host "  -> Copied to: lsp-bin\$PlatformDir\$BinaryName" -ForegroundColor Green
Write-Host ""

# 3. Install npm deps and compile TypeScript
Write-Host "[3/4] Building VS Code Extension..." -ForegroundColor Yellow
Set-Location "$RootDir\vscode-extension"
if (-not (Test-Path "node_modules")) {
    npm install
}
npx tsc
Write-Host "  -> Done" -ForegroundColor Green
Write-Host ""

# 4. Package vsix
Write-Host "[4/4] Packaging .vsix..." -ForegroundColor Yellow
try {
    npx @vscode/vsce package --out "$RootDir\"
    Write-Host "  -> Done: .vsix file created in project root" -ForegroundColor Green
} catch {
    Write-Host "  -> SKIP: vsce not available. Install with: npm install -g @vscode/vsce" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "=== Build Complete ===" -ForegroundColor Cyan
