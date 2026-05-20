import * as vscode from 'vscode';
import { ExtensionRuntime } from '@/bootstrap/runtime/extension-runtime';

/**
 * 整个扩展宿主进程只维护一个 runtime 实例。
 * VS Code 保证 activate/deactivate 生命周期回调串行执行，
 * 因此这里保留一个可变引用即可。
 */
let runtime: ExtensionRuntime | undefined;

/**
 * 扩展入口。
 * 创建 runtime，并将所有装配逻辑委托给 runtime.activate()。
 */
export async function activate(context: vscode.ExtensionContext) {
    runtime = new ExtensionRuntime(context);
    await runtime.activate();
}

/**
 * 扩展关闭钩子。
 * 先释放 runtime，再清空引用，避免意外复用。
 */
export async function deactivate() {
    await runtime?.dispose();
    runtime = undefined;
}
