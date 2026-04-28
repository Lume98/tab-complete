import { window } from 'vscode';

/**
 * Tab 接受补全
 * VS Code 的内联补全接受是内置行为，此命令主要用于触发接受操作
 */
export function acceptCompletion(): void {
    window.activeTextEditor?.insertSnippet(
        // 接受内联补全 - VS Code 会处理实际的文本插入
        // 这里只是一个 fallback，通常内联补全由 VS Code 原生 Tab 键处理
        undefined as any
    );
}
