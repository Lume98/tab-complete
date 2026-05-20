import * as vscode from 'vscode';
import type { CommandActions } from '@/commands/types';
import { registerCommands } from '@/commands';
import type { Settings } from '@/core/config/settings';

export function registerCommandContributions(
    context: vscode.ExtensionContext,
    settings: Settings,
    actions: CommandActions
): void {
    registerCommands(context, {
        settings,
        actions,
    });
}
