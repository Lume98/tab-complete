import * as path from 'path';
import * as fs from 'fs';
import { ExtensionContext } from 'vscode';

export class ServerManager {
    private context: ExtensionContext;

    constructor(context: ExtensionContext) {
        this.context = context;
    }

    /**
     * 解析 Rust LSP Server 二进制路径
     * 查找顺序:
     * 1. 扩展包内的 platform-specific 二进制
     * 2. 环境变量 AI_TAB_COMPLETE_LSP_PATH
     * 3. 开发模式 - 指向 cargo build 产物
     */
    resolveBinaryPath(): string {
        // 环境变量覆盖（开发模式）
        const envPath = process.env.AI_TAB_COMPLETE_LSP_PATH;
        if (envPath && fs.existsSync(envPath)) {
            return envPath;
        }

        // 平台特定路径
        const platform = this.getPlatform();
        const binaryName = this.getBinaryName(platform);
        const binaryPath = path.join(
            this.context.extensionPath,
            'lsp-bin',
            platform,
            binaryName
        );

        if (fs.existsSync(binaryPath)) {
            return binaryPath;
        }

        // 开发模式 fallback: 查找 cargo build 产物
        const devPaths = this.getDevBinaryPaths(binaryName);
        for (const devPath of devPaths) {
            if (fs.existsSync(devPath)) {
                return devPath;
            }
        }

        // 最后 fallback: 返回 extensionPath 中的路径（会失败但报错明确）
        return binaryPath;
    }

    private getPlatform(): string {
        const platform = process.platform;
        const arch = process.arch;

        switch (platform) {
            case 'win32':
                return arch === 'arm64' ? 'win32-arm64' : 'win32-x64';
            case 'darwin':
                return arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
            case 'linux':
                return arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
            default:
                return `${platform}-${arch}`;
        }
    }

    private getBinaryName(platform: string): string {
        return platform.startsWith('win32')
            ? 'ai-tab-complete-lsp.exe'
            : 'ai-tab-complete-lsp';
    }

    private getDevBinaryPaths(binaryName: string): string[] {
        // 常见的 cargo build 产物位置
        const projectRoot = path.resolve(this.context.extensionPath, '..');
        return [
            path.join(projectRoot, 'lsp-server', 'target', 'release', binaryName),
            path.join(projectRoot, 'lsp-server', 'target', 'debug', binaryName),
        ];
    }

    isBinaryAvailable(): boolean {
        try {
            const binPath = this.resolveBinaryPath();
            return fs.existsSync(binPath);
        } catch {
            return false;
        }
    }
}
