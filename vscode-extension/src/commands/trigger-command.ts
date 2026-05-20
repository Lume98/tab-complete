import * as vscode from 'vscode';
import { CommandDefinition } from '@/commands/types';

/** 强制 VS Code 在当前光标位置请求行内补全。 */
export const triggerCommand: CommandDefinition = {
    commandName: 'aiTabComplete.trigger',
    commandFunction: () => {
        void vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
    },
};
