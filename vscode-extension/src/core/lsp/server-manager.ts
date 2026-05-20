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

export class ServerManager {
    constructor(private readonly context: ExtensionContext) {}

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
        return platform.startsWith('win32')
            ? 'ai-tab-complete-lsp.exe'
            : 'ai-tab-complete-lsp';
    }

    private getDevBinaryPaths(binaryName: string): string[] {
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
