import { commands } from 'vscode';
import { CommandDefinition } from '@/commands/types';

/** 隐藏当前行内补全，不修改文档内容。 */
export const dismissCommand: CommandDefinition = {
    commandName: 'aiTabComplete.dismiss',
    commandFunction: () => {
        void commands.executeCommand('editor.action.inlineSuggest.hide');
    },
};
