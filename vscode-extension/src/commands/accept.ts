import { commands } from 'vscode';

export async function acceptCompletion(): Promise<void> {
    await commands.executeCommand('editor.action.inlineSuggest.commit');
}
