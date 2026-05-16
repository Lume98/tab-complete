import { CancellationToken } from 'vscode';

/**
 * 防抖工具 - 延迟执行直到用户停止输入
 */
export class Debouncer {
    private delay: number;
    private lastCall = 0;

    constructor(delay: number) {
        this.delay = delay;
    }

    /**
     * 等待直到防抖时间到或被取消
     * 返回 true 表示可以继续，false 表示被取消
     */
    async wait(token: CancellationToken): Promise<boolean> {
        const now = Date.now();
        const elapsed = now - this.lastCall;
        this.lastCall = now;

        // 首次调用或已超过延迟阈值时，立即放行。
        if (elapsed > this.delay) {
            return !token.isCancellationRequested;
        }

        // 计算还需等待的时间
        const waitTime = this.delay - elapsed;
        if (waitTime <= 0) {
            return !token.isCancellationRequested;
        }

        // 分段 sleep 可保持较低的取消响应延迟。
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

    updateDelay(newDelay: number): void {
        this.delay = newDelay;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
