import { Injectable } from '@nestjs/common';
import { EMPTY_USAGE, LlmMessage, LlmToolUse, LlmUsage } from '../llm.types';
import { LlmDriver, LlmDriverCall, LlmDriverResult } from './llm-driver';

const CHARS_PER_TOKEN: number = 4;

export interface MockAnswer {
    readonly text: string;
    readonly toolUses?: readonly LlmToolUse[];
    readonly usage?: LlmUsage;
}

@Injectable()
export class MockLlmDriver extends LlmDriver {
    private readonly queued: MockAnswer[] = [];
    private readonly failures: Error[] = [];

    public enqueue(answer: MockAnswer | string): void {
        this.queued.push(typeof answer === 'string' ? { text: answer } : answer);
    }

    public enqueueFailure(error: Error): void {
        this.failures.push(error);
    }

    public generate(call: LlmDriverCall): Promise<LlmDriverResult> {
        const failure: Error | undefined = this.failures.shift();
        if (failure !== undefined) {
            return Promise.reject(failure);
        }
        const answer: MockAnswer = this.queued.shift() ?? { text: this.echo(call) };
        const toolUses: readonly LlmToolUse[] = answer.toolUses ?? [];
        return Promise.resolve({
            text: answer.text,
            toolUses,
            stopReason: toolUses.length > 0 ? 'tool_use' : 'end',
            usage: answer.usage ?? this.usageOf(call, answer.text),
            servedModelId: null,
            providerCostUsd: null,
            attempts: 1,
            latencyMs: 0
        });
    }

    private echo(call: LlmDriverCall): string {
        const last: LlmMessage | undefined = call.request.messages.at(-1);
        const content: string = typeof last?.content === 'string' ? last.content : '';
        return `[mock] ${content}`.trim();
    }

    private usageOf(call: LlmDriverCall, text: string): LlmUsage {
        const sent: number = call.request.system.length + JSON.stringify(call.request.messages).length;
        return { ...EMPTY_USAGE, inputTokens: Math.ceil(sent / CHARS_PER_TOKEN), outputTokens: Math.ceil(text.length / CHARS_PER_TOKEN) };
    }
}
