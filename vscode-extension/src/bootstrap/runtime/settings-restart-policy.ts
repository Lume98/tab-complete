import { shouldTriggerRestart } from '@/core/config/settings-utils';

// 配置变更响应动作
export type SettingsChangeAction =
    // 忽略该配置变更
    | { kind: 'ignore' }
    // hot-update：不重启，直接更新流式监听器参数
    | { kind: 'hot-update-stream-listener-max-failures'; value: number | undefined }
    // restart：释放当前客户端并重新启动
    | { kind: 'restart' };

/**
 * 配置变更策略：决定是否需要 restart 或 hot-update
 * 目标：避免不必要的重启，减少用户体验中断
 */
export class SettingsRestartPolicy {
    decide(key: string, value: unknown): SettingsChangeAction {
        // streamListenerMaxFailures：可直接 hot-update，无需重启
        if (key === 'streamListenerMaxFailures') {
            return {
                kind: 'hot-update-stream-listener-max-failures',
                value: typeof value === 'number' ? value : undefined,
            };
        }

        // 其他关键配置：需要 restart（provider、model、useMockClient 等）
        if (shouldTriggerRestart(key)) {
            return { kind: 'restart' };
        }

        // 其他非关键配置：忽略
        return { kind: 'ignore' };
    }
}
