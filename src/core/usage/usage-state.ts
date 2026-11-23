import { BPS_FULL, FeatureMicros, UsageFeature, UsageState, USAGE_FEATURES, USAGE_STATES, UsageStateKey } from './usage.types';

export interface UsageStateInput {
    readonly period: string;
    readonly resetsAt: Date;
    readonly capMicros: number | null;
    readonly byFeatureMicros: FeatureMicros;
    readonly warningBps: number;
    readonly minRoomMicros: number;
}

function bpsOf(used: number, cap: number): number {
    return Math.floor((used * BPS_FULL) / cap);
}

function keyOf(used: number, cap: number, warningBps: number, minRoomMicros: number): UsageStateKey {
    const warningLine: number = (cap * warningBps) / BPS_FULL;
    const pausedFrom: number = Math.max(cap - minRoomMicros, warningLine);
    if (used >= cap || used >= pausedFrom) {
        return USAGE_STATES.paused;
    }
    return used >= warningLine ? USAGE_STATES.warning : USAGE_STATES.ok;
}

function featureBps(byFeatureMicros: FeatureMicros, cap: number | null): Record<UsageFeature, number> {
    const result: Record<UsageFeature, number> = { ai: 0, whatsapp: 0 };
    for (const feature of USAGE_FEATURES) {
        result[feature] = cap === null ? 0 : bpsOf(byFeatureMicros[feature], cap);
    }
    return result;
}

export function usageStateOf(input: UsageStateInput): UsageState {
    const used: number = input.byFeatureMicros.ai + input.byFeatureMicros.whatsapp;
    const cap: number | null = input.capMicros === null || input.capMicros === 0 ? null : input.capMicros;
    return {
        period: input.period,
        capMicros: cap,
        usedMicros: used,
        usedBps: cap === null ? 0 : bpsOf(used, cap),
        byFeature: featureBps(input.byFeatureMicros, cap),
        state: cap === null ? USAGE_STATES.ok : keyOf(used, cap, input.warningBps, input.minRoomMicros),
        resetsAt: input.resetsAt.toISOString()
    };
}
