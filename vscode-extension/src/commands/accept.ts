import { commands } from 'vscode';

// 将当前可见的行内建议提交到文档缓冲区。
export async function acceptCompletion(): Promise<void> {
    await commands.executeCommand('editor.action.inlineSuggest.commit');
}
