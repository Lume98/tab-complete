import assert from 'node:assert/strict';
import * as vscode from 'vscode';

async function testExtensionActivatesAndRegistersCommands(): Promise<void> {
    const extension = vscode.extensions.getExtension('ai-tab-complete.ai-tab-complete');

    assert.ok(extension, 'extension should be available in the extension host');
    await extension.activate();

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('aiTabComplete.trigger'));
    assert.ok(commands.includes('aiTabComplete.toggle'));
    assert.ok(commands.includes('aiTabComplete.clearCache'));
    assert.ok(commands.includes('aiTabComplete.restart'));
}

async function testManualTriggerRunsInMockMode(): Promise<void> {
    await vscode.workspace
        .getConfiguration('aiTabComplete')
        .update('useMockClient', true, vscode.ConfigurationTarget.Global);

    const document = await vscode.workspace.openTextDocument({
        language: 'typescript',
        content: 'function demo() {\n    return\n}\n',
    });
    await vscode.window.showTextDocument(document);

    await vscode.commands.executeCommand('aiTabComplete.trigger');

    assert.ok(vscode.window.activeTextEditor);
}

async function testMockInlineCompletionCanBeAccepted(): Promise<void> {
    await vscode.workspace
        .getConfiguration('aiTabComplete')
        .update('useMockClient', true, vscode.ConfigurationTarget.Global);
    await vscode.workspace
        .getConfiguration('aiTabComplete')
        .update('debounceMs', 50, vscode.ConfigurationTarget.Global);

    const document = await vscode.workspace.openTextDocument({
        language: 'typescript',
        content: 'function demo() {\n    return\n}\n',
    });
    const editor = await vscode.window.showTextDocument(document);
    const position = new vscode.Position(1, '    return'.length);

    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand('aiTabComplete.trigger');
    await waitForInlineSuggestion();
    await vscode.commands.executeCommand('aiTabComplete.accept');

    await waitUntil(() => document.getText().includes('returnnull;'), 2000);
    assert.ok(document.getText().includes('returnnull;'));
}

export async function run(): Promise<void> {
    await testExtensionActivatesAndRegistersCommands();
    await testManualTriggerRunsInMockMode();
    await testMockInlineCompletionCanBeAccepted();
}

async function waitForInlineSuggestion(): Promise<void> {
    await delay(500);
}

async function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (predicate()) {
            return;
        }
        await delay(50);
    }

    throw new Error('Timed out waiting for integration test condition');
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
