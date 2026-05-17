import * as vscode from 'vscode';
import { collectChangedKeys } from '@/config/settings-utils';

type ChangeCallback = (key: string, value: unknown) => void;

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
                const value = this.get(key);
                this.listeners.forEach((cb) => cb(key, value));
            }
        });
    }

    // 读取 VS Code 优先级合并后的当前生效值。
    get<T = unknown>(key: string): T {
        return vscode.workspace.getConfiguration('aiTabComplete').get<T>(key) as T;
    }

    // 持久化到全局用户设置，保证跨工作区行为一致。
    async set<T = unknown>(key: string, value: T): Promise<void> {
        await vscode.workspace.getConfiguration('aiTabComplete').update(key, value, vscode.ConfigurationTarget.Global);
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
