import { BPS_FULL, FeatureMicros, HelpUsage, UsageFeature, UsageState, USAGE_FEATURES, USAGE_STATES, UsageStateKey } from './usage.types';

export interface UsageStateInput {
    readonly period: string;
    readonly resetsAt: Date;
    readonly capMicros: number | null;
    readonly helpCapMicros: number | null;
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
    const result: Record<UsageFeature, number> = { ai: 0, whatsapp: 0, help: 0 };
    for (const feature of USAGE_FEATURES) {
        result[feature] = cap === null ? 0 : bpsOf(byFeatureMicros[feature], cap);
    }
    return result;
}

function activeCapOf(capMicros: number | null): number | null {
    return capMicros === null || capMicros === 0 ? null : capMicros;
}

function mainUsedOf(byFeatureMicros: FeatureMicros, separateHelp: boolean): number {
    return USAGE_FEATURES.filter((feature: UsageFeature): boolean => !separateHelp || feature !== 'help').reduce(
        (sum: number, feature: UsageFeature): number => sum + byFeatureMicros[feature],
        0
    );
}

function separateHelpOf(input: UsageStateInput, mainCap: number | null): HelpUsage {
    const cap: number | null = activeCapOf(input.helpCapMicros);
    const used: number = input.byFeatureMicros.help;
    if (cap === null) {
        return { separate: false, capMicros: mainCap, usedMicros: used, usedBps: 0, state: USAGE_STATES.ok };
    }
    return {
        separate: true,
        capMicros: cap,
        usedMicros: used,
        usedBps: bpsOf(used, cap),
        state: keyOf(used, cap, input.warningBps, input.minRoomMicros)
    };
}

export function usageStateOf(input: UsageStateInput): UsageState {
    const cap: number | null = activeCapOf(input.capMicros);
    const help: HelpUsage = separateHelpOf(input, cap);
    const used: number = mainUsedOf(input.byFeatureMicros, help.separate);
    const usedBps: number = cap === null ? 0 : bpsOf(used, cap);
    const state: UsageStateKey = cap === null ? USAGE_STATES.ok : keyOf(used, cap, input.warningBps, input.minRoomMicros);
    return {
        period: input.period,
        capMicros: cap,
        usedMicros: used,
        usedBps,
        byFeature: featureBps(input.byFeatureMicros, cap),
        state,
        resetsAt: input.resetsAt.toISOString(),
        help: help.separate ? help : { ...help, usedBps, state }
    };
}
