import * as vscode from 'vscode';
import type {
    InlineCompletionClient,
    StreamUpdateCallback,
} from '@/core/completion-client/inline-completion-client';
import type {
    InlineCompletionList,
    InlineCompletionParams,
} from '@/core/lsp/protocol';
import { MockCompletionBuilder } from '@/completion/mock-completion-builder';

export class MockInlineCompletionClient implements InlineCompletionClient, vscode.Disposable {
    private readonly callbacks = new Set<StreamUpdateCallback>();
    private readonly completionBuilder = new MockCompletionBuilder();

    async requestInlineCompletion(
        params: InlineCompletionParams,
        token?: vscode.CancellationToken
    ): Promise<InlineCompletionList | null> {
        if (token?.isCancellationRequested) {
            return null;
        }

        const document = await this.openDocument(params.textDocument.uri);
        if (!document) {
            return null;
        }

        if (token?.isCancellationRequested || document.lineCount === 0) {
            return null;
        }

        if (params.position.line < 0) {
            return null;
        }

        const lineIndex = Math.min(params.position.line, document.lineCount - 1);
        const line = document.lineAt(lineIndex).text;
        const character = Math.max(0, Math.min(params.position.character, line.length));
        const prefix = line.slice(0, character);
        const text = this.completionBuilder.build(prefix, document.languageId);

        if (!text) {
            return null;
        }

        return {
            items: [{ text }],
        };
    }

    async clearCache(): Promise<void> {
        return Promise.resolve();
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
        this.callbacks.clear();
    }

    private async openDocument(uriText: string): Promise<vscode.TextDocument | null> {
        try {
            return await vscode.workspace.openTextDocument(vscode.Uri.parse(uriText));
        } catch (error) {
            console.error('Mock completion failed to open document:', error);
            return null;
        }
    }
}
