import * as vscode from 'vscode';
import { CommandDefinition } from '@/commands/types';
import { Settings } from '@/config/settings';

type StatusMenuAction = 'toggle' | 'restart' | 'clearCache';
type StatusMenuItem = vscode.QuickPickItem & { action: StatusMenuAction };

/** 显示状态栏命令菜单，并把用户选择的动作路由到对应命令处理函数。 */
export function createShowStatusMenuCommand(settings: Settings): CommandDefinition {
    return {
        commandName: 'aiTabComplete.showStatusMenu',
        commandFunction: async () => {
            const enabled = settings.get<boolean>('enableAutoCompletion', null);
            const items: StatusMenuItem[] = [
                {
                    label: enabled ? '$(circle-slash) 禁用自动补全' : '$(check) 启用自动补全',
                    description: '切换自动补全开关',
                    action: 'toggle',
                },
                {
                    label: '$(refresh) 重启服务',
                    description: '重新启动 LSP 服务端',
                    action: 'restart',
                },
                {
                    label: '$(trash) 清除缓存',
                    description: '清除客户端与服务端缓存',
                    action: 'clearCache',
                },
            ];
            const picked = await vscode.window.showQuickPick(items, { placeHolder: 'AI Tab Complete' });
            if (!picked) return;

            const commandByAction: Record<StatusMenuAction, string> = {
                toggle: 'aiTabComplete.toggle',
                restart: 'aiTabComplete.restart',
                clearCache: 'aiTabComplete.clearCache',
            };
            await vscode.commands.executeCommand(commandByAction[picked.action]);
        },
    };
}
