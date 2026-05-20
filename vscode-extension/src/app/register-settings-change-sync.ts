import * as vscode from 'vscode';
import { Settings } from '@/config/settings';
import { StatusIndicator } from '@/status/indicator';

export function registerSettingsChangeSync(
    context: vscode.ExtensionContext,
    settings: Settings,
    indicator: StatusIndicator
): void {
    context.subscriptions.push(
        settings.onDidChange((key) => {
            if (key === 'enableAutoCompletion') {
                settings.get<boolean>('enableAutoCompletion', null)
                    ? indicator.showReady()
                    : indicator.showDisabled();
            }
        })
    );
}
