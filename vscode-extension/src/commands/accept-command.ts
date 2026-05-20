import { commands } from 'vscode';
import { CommandDefinition } from '@/commands/types';

/** 通过 VS Code 原生命令接受当前可见的行内补全。 */
export const acceptCommand: CommandDefinition = {
    commandName: 'aiTabComplete.accept',
    commandFunction: async () => {
        await commands.executeCommand('editor.action.inlineSuggest.commit');
    },
};
