/**
 * 客户端侧 LRU 缓存（带 TTL）
 * 与 Rust Server 端 LruCache 配合实现双层缓存，目标命中率 > 60%。
 *
 * 缓存策略：
 * - Key: uri + document version + line + prefix + provider + model
 * - 淘汰: 最近最少使用 (LRU) + TTL 过期
 * - 大小: 100 条目，5s TTL
 *
 * 流式补全流程：
 * - 流式未完成时不缓存（streamTracker 记录中间状态）
 * - 流式完成后在 Provider 下次调用时才缓存最终文本
 */

interface CacheEntry {
    text: string;
    timestamp: number;
}

/**
 * 扩展宿主进程内的小型内存 LRU 缓存（带 TTL）。
 * 实现依赖 Map 的插入顺序执行 LRU 淘汰。
 */
export class ClientCache {
    // 缓存 Map（利用插入顺序）
    private cache: Map<string, CacheEntry>;
    // 最大条目数
    private maxEntries: number;
    // 生存时间（毫秒）
    private ttlMs: number;

    constructor(maxEntries = 100, ttlMs = 5000) {
        this.cache = new Map();
        this.maxEntries = maxEntries;
        this.ttlMs = ttlMs;
    }

    // 读取缓存：检查 TTL、更新 LRU 位置
    get(key: string): string | undefined {
        const entry = this.cache.get(key);
        if (!entry) return undefined;

        // 在 LRU 刷新前先检查 TTL 过期
        if (Date.now() - entry.timestamp > this.ttlMs) {
            this.cache.delete(key);
            return undefined;
        }

        // LRU 刷新：重新插入以将 key 移到最新位置（Map 尾部）
        this.cache.delete(key);
        this.cache.set(key, entry);
        return entry.text;
    }

    // 写入缓存：达到上限时淘汰最旧条目（Map 头部）
    set(key: string, text: string): void {
        if (this.cache.size >= this.maxEntries) {
            // 获取最旧的 key（Map 的第一个键）
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

    // 清空所有缓存
    clear(): void {
        this.cache.clear();
    }

    // 当前缓存条目数
    get size(): number {
        return this.cache.size;
    }
}
