import * as path from 'path';
import * as fs from 'fs';
import { ExtensionContext } from 'vscode';

export type BinarySource = 'env' | 'packaged' | 'dev-release' | 'dev-debug' | 'missing';

export interface ResolvedBinaryInfo {
    path: string;
    source: BinarySource;
    exists: boolean;
    platform: string;
    binaryName: string;
    envPath?: string;
    checkedPaths: string[];
}

/**
 * 解析平台相关的 LSP 二进制位置，兼容打包模式与开发模式。
 */
export class ServerManager {
    private context: ExtensionContext;

    constructor(context: ExtensionContext) {
        this.context = context;
    }

    /**
     * 解析 Rust LSP Server 二进制路径
     * 查找顺序:
     * 1. 环境变量 AI_TAB_COMPLETE_LSP_PATH
     * 2. 扩展包内的 platform-specific 二进制
     * 3. 开发模式 - 指向 cargo build 产物
     */
    resolveBinaryInfo(): ResolvedBinaryInfo {
        const platform = this.getPlatform();
        const binaryName = this.getBinaryName(platform);
        const packagedPath = path.join(
            this.context.extensionPath,
            'lsp-bin',
            platform,
            binaryName
        );
        const checkedPaths: string[] = [];

        const envPath = process.env.AI_TAB_COMPLETE_LSP_PATH;
        if (envPath) {
            checkedPaths.push(envPath);
            // 显式覆盖在路径存在时具有最高优先级。
            if (fs.existsSync(envPath)) {
                return {
                    path: envPath,
                    source: 'env',
                    exists: true,
                    platform,
                    binaryName,
                    envPath,
                    checkedPaths,
                };
            }
        }

        checkedPaths.push(packagedPath);
        // 生产/发布版扩展路径。
        if (fs.existsSync(packagedPath)) {
            return {
                path: packagedPath,
                source: 'packaged',
                exists: true,
                platform,
                binaryName,
                envPath,
                checkedPaths,
            };
        }

        const devPaths = this.getDevBinaryPaths(binaryName);
        // 开发模式兜底：先尝试 release，再尝试 debug。
        for (const [index, devPath] of devPaths.entries()) {
            checkedPaths.push(devPath);
            if (fs.existsSync(devPath)) {
                return {
                    path: devPath,
                    source: index === 0 ? 'dev-release' : 'dev-debug',
                    exists: true,
                    platform,
                    binaryName,
                    envPath,
                    checkedPaths,
                };
            }
        }

        return {
            path: packagedPath,
            source: 'missing',
            exists: false,
            platform,
            binaryName,
            envPath,
            checkedPaths,
        };
    }

    resolveBinaryPath(): string {
        return this.resolveBinaryInfo().path;
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
        // Windows 可执行文件包含 `.exe`，类 Unix 平台不包含。
        return platform.startsWith('win32')
            ? 'ai-tab-complete-lsp.exe'
            : 'ai-tab-complete-lsp';
    }

    private getDevBinaryPaths(binaryName: string): string[] {
        // 常见的 cargo build 产物位置
        const projectRoot = path.resolve(this.context.extensionPath, '..');
        return [
            path.join(projectRoot, 'server', 'target', 'release', binaryName),
            path.join(projectRoot, 'server', 'target', 'debug', binaryName),
        ];
    }

    isBinaryAvailable(): boolean {
        try {
            return this.resolveBinaryInfo().exists;
        } catch {
            return false;
        }
    }
}
