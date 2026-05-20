import { shouldTriggerRestart } from '@/core/config/settings-utils';

export type SettingsChangeAction =
    | { kind: 'ignore' }
    | { kind: 'hot-update-stream-listener-max-failures'; value: number | undefined }
    | { kind: 'restart' };

export class SettingsRestartPolicy {
    decide(key: string, value: unknown): SettingsChangeAction {
        if (key === 'streamListenerMaxFailures') {
            return {
                kind: 'hot-update-stream-listener-max-failures',
                value: typeof value === 'number' ? value : undefined,
            };
        }

        if (shouldTriggerRestart(key)) {
            return { kind: 'restart' };
        }

        return { kind: 'ignore' };
    }
}
