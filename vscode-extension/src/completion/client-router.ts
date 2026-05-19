import * as vscode from 'vscode';
import { InlineCompletionClient } from '@/completion/provider';
import { StreamUpdateCallback } from '@/lsp/client';
import { InlineCompletionList, InlineCompletionParams } from '@/lsp/protocol';

/**
 * 补全客户端路由器 —— 将补全请求和流式更新透明路由到当前激活的后端。
 * Provider 始终通过路由器通信，底层客户端可自由热切换而无需重新注册 Provider。
 */
export class CompletionClientRouter implements InlineCompletionClient, vscode.Disposable {
    private client: InlineCompletionClient | null = null;
    private clientSubscription: vscode.Disposable | null = null;
    private callbacks = new Set<StreamUpdateCallback>();

    /** 热切换底层补全客户端，先释放旧订阅再赋值新客户端 */
    attach(client: InlineCompletionClient | null): void {
        this.clientSubscription?.dispose();
        this.client = client;

        if (!client) {
            this.clientSubscription = null;
            return;
        }

        this.clientSubscription = client.onStreamUpdate((params) => {
            this.callbacks.forEach((callback) => callback(params));
        });
    }

    async requestInlineCompletion(
        params: InlineCompletionParams,
        token?: vscode.CancellationToken
    ): Promise<InlineCompletionList | null> {
        return this.client?.requestInlineCompletion(params, token) ?? null;
    }

    async clearCache(): Promise<void> {
        await this.client?.clearCache();
    }

    onStreamUpdate(callback: StreamUpdateCallback): vscode.Disposable {
        this.callbacks.add(callback);
        return {
            dispose: () => {
                this.callbacks.delete(callback);
            },
        };
    }

    dispose(): void {
        this.clientSubscription?.dispose();
        this.callbacks.clear();
        this.client = null;
    }
}
