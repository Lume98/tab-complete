import * as vscode from 'vscode';
import { Settings } from '@/core/config/settings';
import { CommandActions, CommandDefinition } from '@/commands/types';
import { acceptCommand } from '@/commands/accept-command';
import { createClearCacheCommand } from '@/commands/clear-cache-command';
import { dismissCommand } from '@/commands/dismiss-command';
import { createRestartCommand } from '@/commands/restart-command';
import { createShowStatusMenuCommand } from '@/commands/show-status-menu-command';
import { statusMenuCommand } from '@/commands/status-menu-command';
import { createToggleCommand } from '@/commands/toggle-command';
import { triggerCommand } from '@/commands/trigger-command';

export interface CommandDependencies {
    settings: Settings;
    actions: CommandActions;
}

/** 注册扩展的全部命令，并把命令处理函数绑定到运行时依赖。 */
export function registerCommands(context: vscode.ExtensionContext, deps: CommandDependencies): void {
    const commands: CommandDefinition[] = [
        triggerCommand,
        acceptCommand,
        dismissCommand,
        statusMenuCommand,
        createShowStatusMenuCommand(deps.settings),
        createToggleCommand(deps.settings),
        createClearCacheCommand(deps.actions),
        createRestartCommand(deps.actions),
    ];

    for (const command of commands) {
        context.subscriptions.push(vscode.commands.registerCommand(command.commandName, command.commandFunction));
    }
}
