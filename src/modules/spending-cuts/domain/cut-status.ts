import { CUT_STATUSES, CutStatus } from './spending-cuts.types';

export interface CutStatusInput {
    readonly hasData: boolean;
    readonly incomeMinor: number;
    readonly gapMinor: number;
    readonly flexibleTotalMinor: number;
}

export function resolveCutStatus(input: CutStatusInput): CutStatus {
    if (!input.hasData) {
        return CUT_STATUSES.noData;
    }
    if (input.incomeMinor === 0) {
        return CUT_STATUSES.noIncome;
    }
    if (input.gapMinor === 0) {
        return CUT_STATUSES.goalMet;
    }
    return input.gapMinor > input.flexibleTotalMinor ? CUT_STATUSES.exceedsFlexible : CUT_STATUSES.cutSuggested;
}
