import * as vscode from 'vscode';
import { StreamUpdateCallback } from '../lsp/client';
import { InlineCompletionList, InlineCompletionParams } from '../lsp/protocol';
import { InlineCompletionClient } from './provider';

/**
 * 用于开发/测试的确定性本地补全后端。
 * 不依赖网络，也不依赖服务端进程。
 */
export class MockInlineCompletionClient implements InlineCompletionClient, vscode.Disposable {
    private readonly callbacks = new Set<StreamUpdateCallback>();

    async requestInlineCompletion(
        params: InlineCompletionParams,
        token?: vscode.CancellationToken
    ): Promise<InlineCompletionList | null> {
        if (token?.isCancellationRequested) {
            return null;
        }

        const document = await vscode.workspace.openTextDocument(
            vscode.Uri.parse(params.textDocument.uri)
        );

        if (token?.isCancellationRequested || document.lineCount === 0) {
            return null;
        }

        const lineIndex = Math.min(params.position.line, document.lineCount - 1);
        const line = document.lineAt(lineIndex).text;
        const prefix = line.slice(0, params.position.character);
        // 基于规则的补全模板，按前缀/语言选择。
        const text = buildMockCompletion(prefix, document.languageId);

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
}

function buildMockCompletion(prefix: string, languageId: string): string {
    const trimmed = prefix.trimEnd();

    if (/console\.$/.test(trimmed)) {
        return 'log()';
    }

    if (/\breturn\s*$/.test(trimmed)) {
        return mockReturnValue(languageId);
    }

    if (/\bif\s*\($/.test(trimmed)) {
        return mockIfSuffix(languageId);
    }

    if (/\bfor\s*$/.test(trimmed)) {
        return mockForSuffix(languageId);
    }

    if (/[({[]$/.test(trimmed)) {
        return mockBlockSuffix(languageId);
    }

    if (!trimmed) {
        return mockLineSkeleton(languageId);
    }

    return mockExpression(languageId);
}

function mockReturnValue(languageId: string): string {
    switch (languageId) {
        case 'python':
            return 'None';
        case 'rust':
            return 'Ok(())';
        case 'go':
            return 'nil';
        case 'json':
            return '{}';
        default:
            return 'null;';
    }
}

function mockIfSuffix(languageId: string): string {
    if (languageId === 'python') {
        return 'True:\n    pass';
    }
    return 'condition) {\n    \n}';
}

function mockForSuffix(languageId: string): string {
    switch (languageId) {
        case 'python':
            return 'item in items:\n    pass';
        case 'rust':
            return 'item in items {\n    \n}';
        default:
            return 'const item of items) {\n    \n}';
    }
}

function mockBlockSuffix(languageId: string): string {
    if (languageId === 'python') {
        return '\n    pass';
    }
    return '\n    \n}';
}

function mockLineSkeleton(languageId: string): string {
    switch (languageId) {
        case 'typescript':
        case 'typescriptreact':
        case 'javascript':
        case 'javascriptreact':
            return 'const mockValue = await Promise.resolve();';
        case 'rust':
            return 'let result = todo!();';
        case 'python':
            return 'mock_value = None';
        case 'go':
            return 'result := doSomething()';
        case 'json':
            return '"mock": true';
        case 'markdown':
            return 'Mock completion preview';
        default:
            return 'mockCompletion()';
    }
}

function mockExpression(languageId: string): string {
    switch (languageId) {
        case 'typescript':
        case 'typescriptreact':
        case 'javascript':
        case 'javascriptreact':
            return '.then((value) => value)';
        case 'rust':
            return '.map(|value| value)';
        case 'python':
            return '_result';
        case 'go':
            return ' != nil {\n\treturn err\n}';
        default:
            return 'Completion';
    }
}
