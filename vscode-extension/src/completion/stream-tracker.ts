/**
 * 跟踪当前活跃流，避免陈旧流覆盖最新文本。
 */
export class StreamTracker {
    private streamId = '';
    private text = '';

    track(streamId: string, text: string): void {
        this.streamId = streamId;
        this.text = text;
    }

    update(streamId: string, text: string): void {
        if (streamId === this.streamId) {
            this.text = text;
        }
    }

    getText(): string {
        return this.text;
    }

    clear(): void {
        this.streamId = '';
        this.text = '';
    }
}
