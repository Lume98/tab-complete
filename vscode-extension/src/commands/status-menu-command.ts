import * as vscode from 'vscode';
import { CommandDefinition } from '@/commands/types';

/** 兼容旧命令入口，将已有状态菜单命令引用转发到新菜单命令。 */
export const statusMenuCommand: CommandDefinition = {
    commandName: 'aiTabComplete.statusMenu',
    commandFunction: async () => {
        await vscode.commands.executeCommand('aiTabComplete.showStatusMenu');
    },
};
