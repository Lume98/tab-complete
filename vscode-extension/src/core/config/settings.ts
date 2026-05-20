import * as vscode from 'vscode';
import { collectChangedKeys } from '@/core/config/settings-utils';

type ChangeCallback = (key: string, value: unknown) => void;
type SettingsScope = vscode.ConfigurationScope | null;

export class Settings {
    // 配置变更监听器
    private listeners: ChangeCallback[] = [];
    // VS Code 配置监听订阅
    private readonly disposable: vscode.Disposable;

    constructor() {
        // 监听 VS Code 配置变更事件
        this.disposable = vscode.workspace.onDidChangeConfiguration((event) => {
            // 收集所有变更的配置键
            const changedKeys = collectChangedKeys((section) => event.affectsConfiguration(section));
            for (const key of changedKeys) {
                // 获取新配置值，通知所有监听器
                const value = this.get(key, null);
                this.listeners.forEach((callback) => callback(key, value));
            }
        });
    }

    // 读取配置值（支持 workspace/folder 级作用域）
    get<T = unknown>(key: string, scope: SettingsScope = null): T {
        return vscode.workspace.getConfiguration('aiTabComplete', scope).get<T>(key) as T;
    }

    // 更新配置值（全局作用域）
    async set<T = unknown>(key: string, value: T): Promise<void> {
        await vscode.workspace
            .getConfiguration('aiTabComplete', null)
            .update(key, value, vscode.ConfigurationTarget.Global);
    }

    // 注册配置变更监听器
    onDidChange(callback: ChangeCallback): vscode.Disposable {
        this.listeners.push(callback);
        return {
            dispose: () => {
                const index = this.listeners.indexOf(callback);
                if (index >= 0) {
                    this.listeners.splice(index, 1);
                }
            },
        };
    }

    // 释放资源
    dispose(): void {
        this.disposable.dispose();
        this.listeners = [];
    }
}
