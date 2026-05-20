/**
 * 跟踪当前活跃流，避免陈旧流覆盖最新文本。
 */
export class StreamTracker {
    private streamId = '';
    private requestKey = '';
    private text = '';
    private done = false;

    track(streamId: string, requestKey: string, text: string): void {
        this.streamId = streamId;
        this.requestKey = requestKey;
        this.text = text;
        this.done = false;
    }

    update(streamId: string, text: string, done = false): boolean {
        if (streamId !== this.streamId) {
            return false;
        }

        const changed = text !== this.text || done !== this.done;
        if (!changed) {
            return false;
        }

        this.text = text;
        this.done = done;
        return true;
    }

    getText(): string {
        return this.text;
    }

    hasActiveRequest(requestKey: string): boolean {
        return this.streamId !== '' && this.requestKey === requestKey;
    }

    isDone(): boolean {
        return this.done;
    }

    clear(): void {
        this.streamId = '';
        this.requestKey = '';
        this.text = '';
        this.done = false;
    }
}
