/**
 * 用户行为追踪
 * 记录补全的接受/取消数据，用于后续优化
 */

interface TelemetryEvent {
    type: 'accepted' | 'dismissed';
    completionId: string;
    timestamp: number;
    latencyMs?: number;
    acceptedLength?: number;
    visibleDurationMs?: number;
}

export class TelemetryCollector {
    private events: TelemetryEvent[] = [];
    private maxEvents = 1000;

    recordAccepted(completionId: string, acceptedLength: number, latencyMs: number): void {
        this.events.push({
            type: 'accepted',
            completionId,
            timestamp: Date.now(),
            acceptedLength,
            latencyMs,
        });
        this.trim();
    }

    recordDismissed(completionId: string, visibleDurationMs: number): void {
        this.events.push({
            type: 'dismissed',
            completionId,
            timestamp: Date.now(),
            visibleDurationMs,
        });
        this.trim();
    }

    getStats(): { totalRequests: number; acceptRate: number; avgLatencyMs: number } {
        const total = this.events.length;
        if (total === 0) {
            return { totalRequests: 0, acceptRate: 0, avgLatencyMs: 0 };
        }

        const accepted = this.events.filter(e => e.type === 'accepted').length;
        const latencies = this.events
            .filter(e => e.type === 'accepted' && e.latencyMs !== undefined)
            .map(e => e.latencyMs!);
        const avgLatency = latencies.length > 0
            ? latencies.reduce((a, b) => a + b, 0) / latencies.length
            : 0;

        return {
            totalRequests: total,
            acceptRate: accepted / total,
            avgLatencyMs: avgLatency,
        };
    }

    clear(): void {
        this.events = [];
    }

    private trim(): void {
        if (this.events.length > this.maxEvents) {
            this.events = this.events.slice(-this.maxEvents);
        }
    }
}
