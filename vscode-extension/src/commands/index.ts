import * as vscode from 'vscode';
import { Settings } from '@/core/config/settings';

export interface CommandActions {
    /** 重启语言服务，使配置和 Provider 变更生效。 */
    restart(): Promise<void>;
    /** 清除服务端进程中的补全缓存。 */
    clearServerCache(): Promise<void>;
    /** 清除 VS Code 扩展进程中的补全缓存。 */
    clearClientCache(): void;
}

/** VS Code 命令注册单元：命令 ID 与可执行处理函数。 */
export interface CommandDefinition {
    commandName: string;
    commandFunction: (...args: unknown[]) => unknown | Promise<unknown>;
}

export interface CommandDependencies {
    settings: Settings;
    actions: CommandActions;
}

/** 强制 VS Code 在当前光标位置请求行内补全。 */
const triggerCommand: CommandDefinition = {
    commandName: 'aiTabComplete.trigger',
    commandFunction: () => {
        void vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
    },
};

/** 通过 VS Code 原生命令接受当前可见的行内补全。 */
const acceptCommand: CommandDefinition = {
    commandName: 'aiTabComplete.accept',
    commandFunction: async () => {
        await vscode.commands.executeCommand('editor.action.inlineSuggest.commit');
    },
};

/** 隐藏当前行内补全，不修改文档内容。 */
const dismissCommand: CommandDefinition = {
    commandName: 'aiTabComplete.dismiss',
    commandFunction: () => {
        void vscode.commands.executeCommand('editor.action.inlineSuggest.hide');
    },
};

/** 兼容旧命令入口，将已有状态菜单命令引用转发到新菜单命令。 */
const statusMenuCommand: CommandDefinition = {
    commandName: 'aiTabComplete.statusMenu',
    commandFunction: async () => {
        await vscode.commands.executeCommand('aiTabComplete.showStatusMenu');
    },
};

type StatusMenuAction = 'toggle' | 'restart' | 'clearCache';
type StatusMenuItem = vscode.QuickPickItem & { action: StatusMenuAction };

/** 显示状态栏命令菜单，并把用户选择的动作路由到对应命令处理函数。 */
function createShowStatusMenuCommand(settings: Settings): CommandDefinition {
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

/** 切换自动行内补全开关，保留扩展的其他运行状态。 */
function createToggleCommand(settings: Settings): CommandDefinition {
    return {
        commandName: 'aiTabComplete.toggle',
        commandFunction: async () => {
            const current = settings.get<boolean>('enableAutoCompletion', null);
            await settings.set('enableAutoCompletion', !current);
        },
    };
}

/** 清除客户端和服务端两层缓存，使后续补全基于新上下文重新计算。 */
function createClearCacheCommand(actions: CommandActions): CommandDefinition {
    return {
        commandName: 'aiTabComplete.clearCache',
        commandFunction: async () => {
            await actions.clearServerCache();
            actions.clearClientCache();
            vscode.window.showInformationMessage('AI Tab Complete 缓存已清除');
        },
    };
}

/** 重启处理补全请求的后端服务。 */
function createRestartCommand(actions: CommandActions): CommandDefinition {
    return {
        commandName: 'aiTabComplete.restart',
        commandFunction: async () => {
            await actions.restart();
        },
    };
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
