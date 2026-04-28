import * as vscode from 'vscode';
import { LspClient } from './lsp/client';
import { Settings } from './config/settings';
import { AIInlineCompletionProvider } from './completion/provider';
import { StatusBarManager } from './status/status-bar';

const MAX_RESTART_ATTEMPTS = 3;
const RESTART_DELAY_MS = 2000;

let lspClient: LspClient | undefined;
let statusBar: StatusBarManager | undefined;
let restartCount = 0;

export async function activate(context: vscode.ExtensionContext) {
    const settings = new Settings();

    statusBar = new StatusBarManager();
    statusBar.showInitializing();

    // 启动 LSP Server（带自动重启）
    await startLspServer(context);

    // 注册补全提供器（即使 LSP 未启动也注册，避免后续启动时需要重新注册）
    const provider = new AIInlineCompletionProvider(
        lspClient ?? new NullLspClient(),
        settings
    );
    context.subscriptions.push(
        vscode.languages.registerInlineCompletionItemProvider(
            { pattern: '**' },
            provider
        )
    );

    // 注册命令
    context.subscriptions.push(
        vscode.commands.registerCommand('aiTabComplete.trigger', () => {
            vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('aiTabComplete.toggle', async () => {
            const current = settings.get<boolean>('enableAutoCompletion');
            await settings.set('enableAutoCompletion', !current);
            statusBar?.showReady(!current);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('aiTabComplete.clearCache', async () => {
            if (lspClient) {
                await lspClient.clearCache();
            }
            provider.clearCache();
            vscode.window.showInformationMessage('AI Tab Complete 缓存已清除');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('aiTabComplete.restart', async () => {
            restartCount = 0;
            await restartLspServer(context);
        })
    );

    settings.onDidChange((key) => {
        if (key === 'enableAutoCompletion') {
            statusBar?.showReady(settings.get<boolean>('enableAutoCompletion'));
        }
    });

    const outputChannel = vscode.window.createOutputChannel('AI Tab Complete');
    context.subscriptions.push(outputChannel);
    outputChannel.appendLine('AI Tab Complete activated');
}

async function startLspServer(context: vscode.ExtensionContext): Promise<void> {
    try {
        lspClient = new LspClient(context);
        await lspClient.start();
        statusBar?.showReady();
        restartCount = 0;
    } catch (error) {
        console.error('Failed to start LSP server:', error);
        statusBar?.showError('LSP Server 启动失败');
        lspClient = undefined;
    }
}

async function restartLspServer(context: vscode.ExtensionContext): Promise<void> {
    statusBar?.showInitializing();

    // 停止旧的
    if (lspClient) {
        try {
            await lspClient.stop();
        } catch {
            // 忽略停止错误
        }
        lspClient = undefined;
    }

    // 等待一会儿再重启
    await new Promise(resolve => setTimeout(resolve, RESTART_DELAY_MS));

    await startLspServer(context);
}

export function deactivate() {
    if (lspClient) {
        lspClient.stop().catch(err => {
            console.error('Error stopping LSP client:', err);
        });
    }
    if (statusBar) {
        statusBar.dispose();
    }
}

/** 空客户端，LSP 未启动时使用，所有请求返回 null */
class NullLspClient extends LspClient {
    constructor() {
        // 传一个 stub context，不会被实际使用
        super({ extensionPath: '', subscriptions: [] } as any);
    }
}
