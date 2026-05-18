import * as vscode from 'vscode';
import { collectChangedKeys } from '@/config/settings-utils';

type ChangeCallback = (key: string, value: unknown) => void;
type SettingsScope = vscode.ConfigurationScope | null;

/**
 * aiTabComplete 命名空间的 Settings 门面层。
 * 当前行为：aiTabComplete 下任意键变化都发出粗粒度变更通知（'*'）。
 * 需要按键差异的调用方必须自行重新读取值。
 */
export class Settings {
    private listeners: ChangeCallback[] = [];
    private disposable: vscode.Disposable;

    constructor() {
        this.disposable = vscode.workspace.onDidChangeConfiguration((e) => {
            const changedKeys = collectChangedKeys((section) => e.affectsConfiguration(section));
            for (const key of changedKeys) {
                const value = this.get(key, null);
                this.listeners.forEach((cb) => cb(key, value));
            }
        });
    }

    // 显式传入 scope；无资源上下文时使用 null，避免 VS Code 把读取解释成“遗漏了资源”。
    get<T = unknown>(key: string, scope: SettingsScope = null): T {
        return vscode.workspace.getConfiguration('aiTabComplete', scope).get<T>(key) as T;
    }

    // 持久化到全局用户设置，保证跨工作区行为一致。
    async set<T = unknown>(key: string, value: T): Promise<void> {
        await vscode.workspace
            .getConfiguration('aiTabComplete', null)
            .update(key, value, vscode.ConfigurationTarget.Global);
    }

    onDidChange(callback: ChangeCallback): vscode.Disposable {
        this.listeners.push(callback);
        return {
            dispose: () => {
                const idx = this.listeners.indexOf(callback);
                if (idx >= 0) this.listeners.splice(idx, 1);
            }
        };
    }

    dispose(): void {
        this.disposable.dispose();
        this.listeners = [];
    }
}
