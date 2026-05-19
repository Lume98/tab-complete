import { window, StatusBarAlignment, StatusBarItem, Disposable, ThemeColor } from 'vscode';

const DEFAULT_TOOLTIP = 'AI Tab Complete - 点击打开菜单';

/**
 * 扩展状态指示器：initializing / ready / disabled / error。
 */
export class StatusIndicator implements Disposable {
    private readonly item: StatusBarItem;

    constructor() {
        this.item = window.createStatusBarItem(
            'aiTabComplete',
            StatusBarAlignment.Right,
            100
        );
        this.item.name = 'AI Tab Complete';
        this.item.tooltip = DEFAULT_TOOLTIP;
        this.item.command = 'aiTabComplete.statusMenu';
        this.item.text = '$(sync~spin) AI Tab';
        this.item.show();
    }

    showInitializing(): void {
        this.item.text = '$(sync~spin) AI Tab';
        this.item.tooltip = DEFAULT_TOOLTIP;
        this.item.backgroundColor = undefined;
    }

    showReady(): void {
        this.item.text = '$(check) AI Tab';
        this.item.tooltip = DEFAULT_TOOLTIP;
        this.item.backgroundColor = undefined;
    }

    showDisabled(): void {
        this.item.text = '$(circle-slash) AI Tab';
        this.item.tooltip = DEFAULT_TOOLTIP;
        this.item.backgroundColor = undefined;
    }

    showError(message?: string): void {
        this.item.text = '$(error) AI Tab';
        this.item.tooltip = message ?? 'AI Tab Complete: 发生错误，点击重新启用';
        this.item.backgroundColor = new ThemeColor(
            'statusBarItem.errorBackground'
        );
    }

    dispose(): void {
        this.item.dispose();
    }
}
