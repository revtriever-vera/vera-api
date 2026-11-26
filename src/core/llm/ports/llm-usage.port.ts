import { TenantLlmFeature } from '../llm.types';

export interface LlmRoomInput {
    readonly feature: TenantLlmFeature;
    readonly task: string;
    readonly estimateMicros: number;
}

export interface LlmRecordInput {
    readonly feature: TenantLlmFeature;
    readonly task: string;
    readonly referenceId: string;
    readonly costMicros: number;
    readonly providerCostMicros?: number;
    readonly estimateMicros?: number;
    readonly outcome?: 'answered' | 'unanswered';
    readonly detail?: Readonly<Record<string, string | number | boolean | null>>;
}

export abstract class LlmUsagePort {
    public abstract assertRoom(input: LlmRoomInput): Promise<void>;
    public abstract record(input: LlmRecordInput): Promise<void>;
}
