import { window, StatusBarAlignment, StatusBarItem, Disposable, ThemeColor } from 'vscode';

const DEFAULT_TOOLTIP = 'AI Tab Complete - 点击打开菜单';

/**
 * 状态栏指示器：显示补全客户端状态
 * 状态流转：initializing → ready/disabled/error
 */
export class StatusIndicator implements Disposable {
    // 状态栏项
    private readonly item: StatusBarItem;

    constructor() {
        // 创建状态栏项（右对齐，优先级 100）
        this.item = window.createStatusBarItem(
            'aiTabComplete',
            StatusBarAlignment.Right,
            100
        );
        this.item.name = 'AI Tab Complete';
        this.item.tooltip = DEFAULT_TOOLTIP;
        // 点击状态栏打开菜单命令
        this.item.command = 'aiTabComplete.statusMenu';
        // 初始状态：旋转图标表示初始化中
        this.item.text = '$(sync~spin) AI Tab';
        this.item.show();
    }

    // 显示初始化中
    showInitializing(): void {
        this.item.text = '$(sync~spin) AI Tab';
        this.item.tooltip = DEFAULT_TOOLTIP;
        this.item.backgroundColor = undefined;
    }

    // 显示就绪（✓ 图标，绿色）
    showReady(): void {
        this.item.text = '$(check) AI Tab';
        this.item.tooltip = DEFAULT_TOOLTIP;
        this.item.backgroundColor = undefined;
    }

    // 显示禁用（禁止符号）
    showDisabled(): void {
        this.item.text = '$(circle-slash) AI Tab';
        this.item.tooltip = DEFAULT_TOOLTIP;
        this.item.backgroundColor = undefined;
    }

    // 显示错误（⚠️ 图标，红色背景）
    showError(message?: string): void {
        this.item.text = '$(error) AI Tab';
        this.item.tooltip = message ?? 'AI Tab Complete: 发生错误，点击重新启用';
        // 使用错误背景色强调
        this.item.backgroundColor = new ThemeColor('statusBarItem.errorBackground');
    }

    // 释放资源
    dispose(): void {
        this.item.dispose();
    }
}
