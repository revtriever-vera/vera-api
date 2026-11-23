import { LlmReasoning, LlmTask } from '../llm.types';

export interface LlmTaskSpec {
    readonly task: LlmTask;
    readonly maxOutputTokens: number;
    readonly maxCostMicros: number;
    readonly temperature: number;
    readonly reasoning: LlmReasoning;
    readonly timeoutMs: number;
    readonly maxRetries: number;
    readonly evalThreshold: number;
    readonly promptVersion: string;
}
