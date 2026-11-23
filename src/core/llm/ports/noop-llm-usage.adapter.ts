import { Injectable } from '@nestjs/common';
import { LlmRecordInput, LlmRoomInput, LlmUsagePort } from './llm-usage.port';

@Injectable()
export class NoopLlmUsageAdapter extends LlmUsagePort {
    public assertRoom(_input: LlmRoomInput): Promise<void> {
        return Promise.resolve();
    }

    public record(_input: LlmRecordInput): Promise<void> {
        return Promise.resolve();
    }
}
