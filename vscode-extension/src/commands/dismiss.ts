import { commands } from 'vscode';

/**
 * Esc 取消补全
 * 隐藏当前显示的内联补全建议
 */
export function dismissCompletion(): void {
    commands.executeCommand('editor.action.inlineSuggest.hide');
}
