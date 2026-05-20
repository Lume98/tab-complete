import * as vscode from 'vscode';
import { CommandActions, CommandDefinition } from '@/commands/types';

/** 清除客户端和服务端两层缓存，使后续补全基于新上下文重新计算。 */
export function createClearCacheCommand(actions: CommandActions): CommandDefinition {
    return {
        commandName: 'aiTabComplete.clearCache',
        commandFunction: async () => {
            await actions.clearServerCache();
            actions.clearClientCache();
            vscode.window.showInformationMessage('AI Tab Complete 缓存已清除');
        },
    };
}
