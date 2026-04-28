/**
 * 客户端侧 LRU 缓存
 * 避免在短时间内对相同上下文重复请求
 */

interface CacheEntry {
    text: string;
    timestamp: number;
}

export class ClientCache {
    private cache: Map<string, CacheEntry>;
    private maxEntries: number;
    private ttlMs: number;

    constructor(maxEntries = 100, ttlMs = 5000) {
        this.cache = new Map();
        this.maxEntries = maxEntries;
        this.ttlMs = ttlMs;
    }

    get(key: string): string | undefined {
        const entry = this.cache.get(key);
        if (!entry) return undefined;

        if (Date.now() - entry.timestamp > this.ttlMs) {
            this.cache.delete(key);
            return undefined;
        }

        // LRU: 移动到尾部
        this.cache.delete(key);
        this.cache.set(key, entry);
        return entry.text;
    }

    set(key: string, text: string): void {
        // 达到上限时移除最旧的条目
        if (this.cache.size >= this.maxEntries) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey !== undefined) {
                this.cache.delete(oldestKey);
            }
        }

        this.cache.set(key, {
            text,
            timestamp: Date.now(),
        });
    }

    clear(): void {
        this.cache.clear();
    }

    get size(): number {
        return this.cache.size;
    }
}
