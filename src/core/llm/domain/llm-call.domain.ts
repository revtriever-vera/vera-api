import { Injectable } from '@nestjs/common';
import { LlmCall } from '../llm-calls.types';
import { LlmCallsRepository } from '../repositories/llm-calls.repository';

export interface LlmCallDraft {
    readonly callId: string;
    readonly task: string;
    readonly feature: string;
    readonly driver: string;
    readonly modelId: string;
    readonly servedModelId: string | null;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheReadTokens: number;
    readonly costMicros: number;
    readonly gatewayCostMicros: number | null;
    readonly latencyMs: number;
    readonly attempts: number;
    readonly outcome: string;
    readonly requestHash: string;
    readonly referenceId: string | null;
}

@Injectable()
export class LlmCallDomain {
    public constructor(private readonly calls: LlmCallsRepository) {}

    public async record(draft: LlmCallDraft): Promise<LlmCall> {
        return this.calls.insertCall({
            id: draft.callId,
            task: draft.task,
            feature: draft.feature,
            driver: draft.driver,
            modelId: draft.modelId,
            servedModelId: draft.servedModelId,
            inputTokens: draft.inputTokens,
            outputTokens: draft.outputTokens,
            cacheReadTokens: draft.cacheReadTokens,
            costMicros: draft.costMicros,
            gatewayCostMicros: draft.gatewayCostMicros,
            latencyMs: draft.latencyMs,
            attempts: draft.attempts,
            outcome: draft.outcome,
            requestHash: draft.requestHash,
            referenceId: draft.referenceId
        });
    }

    public async answeredSince(requestHash: string, since: Date): Promise<number> {
        return this.calls.countAnsweredSince(requestHash, since);
    }

    public async eraseAll(): Promise<number> {
        return this.calls.eraseAll();
    }

    public async purgeBefore(cutoff: Date): Promise<number> {
        return this.calls.purgeBefore(cutoff);
    }
}
