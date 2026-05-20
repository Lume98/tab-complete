import { CommandActions, CommandDefinition } from '@/commands/types';

/** 重启处理补全请求的后端服务。 */
export function createRestartCommand(actions: CommandActions): CommandDefinition {
    return {
        commandName: 'aiTabComplete.restart',
        commandFunction: async () => {
            await actions.restart();
        },
    };
}
