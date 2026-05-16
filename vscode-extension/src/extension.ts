import * as vscode from 'vscode';
import { ExtensionRuntime } from './app/runtime';

let runtime: ExtensionRuntime | undefined;

export async function activate(context: vscode.ExtensionContext) {
    runtime = new ExtensionRuntime(context);
    await runtime.activate();
}

export function deactivate() {
    runtime?.dispose();
    runtime = undefined;
}
