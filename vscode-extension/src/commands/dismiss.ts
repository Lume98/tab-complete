import { commands } from 'vscode';

// 隐藏当前可见的行内建议且不应用。
export function dismissCompletion(): void {
    void commands.executeCommand('editor.action.inlineSuggest.hide');
}
