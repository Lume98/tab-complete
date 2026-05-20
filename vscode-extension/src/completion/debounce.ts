import { CancellationToken } from 'vscode';

/**
 * 防抖工具 - 延迟执行直到用户停止输入（150ms 默认）
 * 用于控制补全请求频率，避免 API 调用过于频繁。
 */
export class Debouncer {
    // 防抖延迟（毫秒）
    private delay: number;
    // 上次调用时间戳
    private lastCall = 0;

    constructor(delay: number) {
        this.delay = delay;
    }

    /**
     * 等待直到防抖时间到或被取消。
     * 返回 true 表示可以继续执行补全，false 表示被取消（用户继续输入）
     */
    async wait(token: CancellationToken): Promise<boolean> {
        const now = Date.now();
        const elapsed = now - this.lastCall;
        this.lastCall = now;

        // 首次调用或已超过延迟阈值时，立即放行（无需等待）
        if (elapsed > this.delay) {
            return !token.isCancellationRequested;
        }

        // 计算还需等待的时间
        const waitTime = this.delay - elapsed;
        if (waitTime <= 0) {
            return !token.isCancellationRequested;
        }

        // 分段 sleep（每 10ms 检查一次 cancellation token）
        // 这保持较低的取消响应延迟，避免用户继续输入时仍发起补全请求
        const interval = 10;
        let waited = 0;
        while (waited < waitTime) {
            await this.sleep(interval);
            waited += interval;
            if (token.isCancellationRequested) {
                return false;
            }
        }

        return !token.isCancellationRequested;
    }

    // 热更新防抖延迟（配置变更时调用）
    updateDelay(newDelay: number): void {
        this.delay = newDelay;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
