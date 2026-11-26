import { Injectable } from '@nestjs/common';
import { LlmCall, NewLlmCall } from '../llm-calls.types';
import { isPlatformFeature } from '../llm.types';
import { LlmCallsRepository } from '../repositories/llm-calls.repository';
import { PlatformLlmCallsRepository } from '../repositories/platform-llm-calls.repository';

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
    public constructor(
        private readonly calls: LlmCallsRepository,
        private readonly platformCalls: PlatformLlmCallsRepository
    ) {}

    public async record(draft: LlmCallDraft): Promise<LlmCall> {
        const row: Omit<NewLlmCall, 'companyId'> = this.rowOf(draft);
        return isPlatformFeature(draft.feature) ? this.platformCalls.insertCall(row) : this.calls.insertCall(row);
    }

    public async answeredSince(requestHash: string, since: Date, feature: string): Promise<number> {
        return isPlatformFeature(feature)
            ? this.platformCalls.countAnsweredSince(requestHash, since)
            : this.calls.countAnsweredSince(requestHash, since);
    }

    public async platformCostSince(feature: string, since: Date): Promise<number> {
        return this.platformCalls.costSince(feature, since);
    }

    public async eraseAll(): Promise<number> {
        return this.calls.eraseAll();
    }

    public async purgeBefore(cutoff: Date): Promise<number> {
        return this.calls.purgeBefore(cutoff);
    }

    private rowOf(draft: LlmCallDraft): Omit<NewLlmCall, 'companyId'> {
        return {
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
        };
    }
}
