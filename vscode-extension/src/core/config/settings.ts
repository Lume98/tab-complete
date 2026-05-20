import * as vscode from 'vscode';
import { collectChangedKeys } from '@/core/config/settings-utils';

type ChangeCallback = (key: string, value: unknown) => void;
type SettingsScope = vscode.ConfigurationScope | null;

export class Settings {
    private listeners: ChangeCallback[] = [];
    private readonly disposable: vscode.Disposable;

    constructor() {
        this.disposable = vscode.workspace.onDidChangeConfiguration((event) => {
            const changedKeys = collectChangedKeys((section) => event.affectsConfiguration(section));
            for (const key of changedKeys) {
                const value = this.get(key, null);
                this.listeners.forEach((callback) => callback(key, value));
            }
        });
    }

    get<T = unknown>(key: string, scope: SettingsScope = null): T {
        return vscode.workspace.getConfiguration('aiTabComplete', scope).get<T>(key) as T;
    }

    async set<T = unknown>(key: string, value: T): Promise<void> {
        await vscode.workspace
            .getConfiguration('aiTabComplete', null)
            .update(key, value, vscode.ConfigurationTarget.Global);
    }

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

    dispose(): void {
        this.disposable.dispose();
        this.listeners = [];
    }
}
