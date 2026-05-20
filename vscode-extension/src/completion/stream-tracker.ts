/**
 * 跟踪当前活跃流，避免陈旧流覆盖最新文本。
 * 流式补全场景：
 * 1. Provider 请求补全，获得 streamId + 初始文本
 * 2. track() 记录当前流的 streamId、缓存 key、初始文本、完成标志
 * 3. Server 推送 SSE 更新 → Client 调用 update(streamId, newText, done)
 * 4. 如果 streamId 匹配且文本改变，update 返回 true 触发重新渲染
 * 5. 流完成后下次 provider 调用会缓存结果、清空追踪器
 */
export class StreamTracker {
    // 当前活跃流的 ID
    private streamId = '';
    // 当前活跃流关联的缓存 key（用于匹配后续 provider 调用）
    private requestKey = '';
    // 累积的补全文本
    private text = '';
    // 流是否已完成
    private done = false;

    // 初始化流追踪：记录 streamId、缓存 key、初始文本
    track(streamId: string, requestKey: string, text: string): void {
        this.streamId = streamId;
        this.requestKey = requestKey;
        this.text = text;
        this.done = false;
    }

    // 更新流状态：新 token 文本 + 完成标志；返回 true 表示有变化，需触发重新渲染
    update(streamId: string, text: string, done = false): boolean {
        // 流 ID 不匹配，忽略陈旧流的更新
        if (streamId !== this.streamId) {
            return false;
        }

        // 检查文本或完成状态是否改变
        const changed = text !== this.text || done !== this.done;
        if (!changed) {
            return false;
        }

        this.text = text;
        this.done = done;
        return true;
    }

    // 获取当前累积文本
    getText(): string {
        return this.text;
    }

    // 检查是否存在与指定缓存 key 匹配的活跃流
    hasActiveRequest(requestKey: string): boolean {
        return this.streamId !== '' && this.requestKey === requestKey;
    }

    // 流是否已完成
    isDone(): boolean {
        return this.done;
    }

    // 清空当前流状态
    clear(): void {
        this.streamId = '';
        this.requestKey = '';
        this.text = '';
        this.done = false;
    }
}
