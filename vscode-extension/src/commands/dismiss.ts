import { commands } from 'vscode';

export function dismissCompletion(): void {
    void commands.executeCommand('editor.action.inlineSuggest.hide');
}
