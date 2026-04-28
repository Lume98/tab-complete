import * as vscode from 'vscode';

type ChangeCallback = (key: string, value: unknown) => void;

export class Settings {
    private listeners: ChangeCallback[] = [];
    private disposable: vscode.Disposable;

    constructor() {
        this.disposable = vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('aiTabComplete')) {
                this.listeners.forEach(cb => cb('*', null));
            }
        });
    }

    get<T = unknown>(key: string): T {
        return vscode.workspace.getConfiguration('aiTabComplete').get<T>(key) as T;
    }

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
