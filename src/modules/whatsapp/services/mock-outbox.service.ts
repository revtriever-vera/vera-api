import { Injectable } from '@nestjs/common';

export type MockSentMessage = {
    readonly to: string;
    readonly kind: 'text' | 'template' | 'interactive';
    readonly wamid: string;
    readonly body: string | null;
};

@Injectable()
export class MockOutbox {
    private readonly sent: MockSentMessage[] = [];

    public record(message: MockSentMessage): void {
        this.sent.push(message);
    }

    public list(): readonly MockSentMessage[] {
        return [...this.sent];
    }

    public clear(): void {
        this.sent.length = 0;
    }
}
