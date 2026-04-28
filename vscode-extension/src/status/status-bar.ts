import { window, StatusBarAlignment, StatusBarItem, Disposable, ThemeColor } from 'vscode';

type StatusState = 'initializing' | 'ready' | 'error' | 'disabled';

export class StatusBarManager implements Disposable {
    private item: StatusBarItem;
    private state: StatusState = 'initializing';

    constructor() {
        this.item = window.createStatusBarItem(
            'aiTabComplete',
            StatusBarAlignment.Right,
            100
        );
        this.item.name = 'AI Tab Complete';
        this.item.tooltip = 'AI Tab Complete - 点击切换自动补全';
        this.item.command = 'aiTabComplete.toggle';
        this.item.show();
    }

    showInitializing(): void {
        this.state = 'initializing';
        this.item.text = '$(sync~spin) AI Tab';
        this.item.backgroundColor = undefined;
        this.item.show();
    }

    showReady(enabled?: boolean): void {
        const isEnabled = enabled ?? this.state !== 'disabled';
        this.state = isEnabled ? 'ready' : 'disabled';
        this.item.text = isEnabled
            ? '$(check) AI Tab'
            : '$(circle-slash) AI Tab';
        this.item.backgroundColor = undefined;
        this.item.show();
    }

    showError(message?: string): void {
        this.state = 'error';
        this.item.text = '$(error) AI Tab';
        this.item.tooltip = message ?? 'AI Tab Complete: 发生错误，点击重新启用';
        this.item.backgroundColor = new ThemeColor(
            'statusBarItem.errorBackground'
        );
        this.item.show();
    }

    getState(): StatusState {
        return this.state;
    }

    dispose(): void {
        this.item.dispose();
    }
}
