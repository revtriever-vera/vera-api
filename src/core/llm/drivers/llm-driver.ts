import { LlmTaskSpec } from '../catalog/llm-task.types';
import { LlmCredentials, LlmGenerationRequest, LlmStopReason, LlmToolUse, LlmUsage } from '../llm.types';

export type LlmDriverRequest = Omit<LlmGenerationRequest, 'task' | 'feature' | 'referenceId'> & { readonly task: string };

export interface LlmDriverCall {
    readonly credentials: LlmCredentials;
    readonly request: LlmDriverRequest;
    readonly spec: LlmTaskSpec;
}

export interface LlmCallDiagnostic {
    readonly finishReason: string;
    readonly reasoningTokens: number;
    readonly reasoningChars: number;
}

export interface LlmDriverResult {
    readonly text: string;
    readonly toolUses: readonly LlmToolUse[];
    readonly stopReason: LlmStopReason;
    readonly usage: LlmUsage;
    readonly servedModelId: string | null;
    readonly providerCostUsd: number | null;
    readonly attempts: number;
    readonly latencyMs: number;
    readonly diagnostic?: LlmCallDiagnostic;
}

export abstract class LlmDriver {
    public abstract generate(call: LlmDriverCall): Promise<LlmDriverResult>;
}
