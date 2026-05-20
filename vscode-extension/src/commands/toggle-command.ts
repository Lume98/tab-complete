import { CommandDefinition } from '@/commands/types';
import { Settings } from '@/config/settings';

/** 切换自动行内补全开关，保留扩展的其他运行状态。 */
export function createToggleCommand(settings: Settings): CommandDefinition {
    return {
        commandName: 'aiTabComplete.toggle',
        commandFunction: async () => {
            const current = settings.get<boolean>('enableAutoCompletion', null);
            await settings.set('enableAutoCompletion', !current);
        },
    };
}
