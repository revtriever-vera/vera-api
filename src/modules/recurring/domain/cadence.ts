import { byDate, Charge } from './charge';
import { daysBetween } from './recurring-dates';
import { isWithinRatio } from './recurring-math';
import { Cadence, CADENCE_COVERAGE, CADENCES, DUPLICATE_MAX_DAYS, DUPLICATE_VALUE_TOLERANCE } from './recurring.types';

interface CadenceRule {
    readonly cadence: Cadence;
    readonly minDays: number;
    readonly maxDays: number;
    readonly minCharges: number;
    readonly knownMinCharges: number;
}

export const CADENCE_RULES: readonly CadenceRule[] = [
    { cadence: CADENCES.weekly, minDays: 6, maxDays: 8, minCharges: 4, knownMinCharges: 4 },
    { cadence: CADENCES.biweekly, minDays: 13, maxDays: 17, minCharges: 4, knownMinCharges: 4 },
    { cadence: CADENCES.monthly, minDays: 26, maxDays: 35, minCharges: 3, knownMinCharges: 2 },
    { cadence: CADENCES.bimonthly, minDays: 56, maxDays: 66, minCharges: 3, knownMinCharges: 3 },
    { cadence: CADENCES.quarterly, minDays: 84, maxDays: 98, minCharges: 3, knownMinCharges: 3 },
    { cadence: CADENCES.semiannual, minDays: 168, maxDays: 196, minCharges: 2, knownMinCharges: 2 },
    { cadence: CADENCES.annual, minDays: 350, maxDays: 380, minCharges: 2, knownMinCharges: 2 }
];

export interface CollapsedCharges {
    readonly kept: readonly Charge[];
    readonly duplicates: readonly Charge[];
}

export interface CadenceFit {
    readonly cadence: Cadence;
    readonly charges: readonly Charge[];
}

function isDuplicateOf(charge: Charge, previous: Charge): boolean {
    return (
        charge.transaction.accountId === previous.transaction.accountId &&
        daysBetween(charge.transaction.date, previous.transaction.date) <= DUPLICATE_MAX_DAYS &&
        isWithinRatio(charge.amountMinor, previous.amountMinor, DUPLICATE_VALUE_TOLERANCE)
    );
}

export function collapseDuplicates(charges: readonly Charge[]): CollapsedCharges {
    const kept: Charge[] = [];
    const duplicates: Charge[] = [];
    for (const charge of [...charges].sort(byDate)) {
        const previous: Charge | undefined = kept.at(-1);
        if (previous !== undefined && isDuplicateOf(charge, previous)) {
            duplicates.push(charge);
            continue;
        }
        kept.push(charge);
    }
    return { kept, duplicates };
}

function intervalsOf(charges: readonly Charge[]): readonly number[] {
    const intervals: number[] = [];
    for (let index: number = 1; index < charges.length; index += 1) {
        intervals.push(daysBetween(charges[index - 1]?.transaction.date ?? '', charges[index]?.transaction.date ?? ''));
    }
    return intervals;
}

function isInRange(interval: number, rule: CadenceRule, factor: number): boolean {
    return interval >= rule.minDays * factor && interval <= rule.maxDays * factor;
}

function scoreRule(intervals: readonly number[], rule: CadenceRule): number {
    const inRange: number = intervals.filter((interval: number): boolean => isInRange(interval, rule, 1)).length;
    const doubled: number = intervals.filter((interval: number): boolean => isInRange(interval, rule, 2)).length;
    if (doubled > 1) {
        return 0;
    }
    const accepted: number = inRange + doubled;
    const covered: boolean = accepted / intervals.length >= CADENCE_COVERAGE;
    return covered && inRange > 0 ? inRange * 1000 + accepted : 0;
}

function requiredCharges(rule: CadenceRule, known: boolean): number {
    return known ? rule.knownMinCharges : rule.minCharges;
}

function bestRule(charges: readonly Charge[], known: boolean): Cadence | null {
    const intervals: readonly number[] = intervalsOf(charges);
    let best: Cadence | null = null;
    let bestScore: number = 0;
    for (const rule of CADENCE_RULES) {
        const score: number = charges.length >= requiredCharges(rule, known) ? scoreRule(intervals, rule) : 0;
        if (score > bestScore) {
            best = rule.cadence;
            bestScore = score;
        }
    }
    return best;
}

export function fitCadence(charges: readonly Charge[], known: boolean): CadenceFit | null {
    const sorted: readonly Charge[] = [...charges].sort(byDate);
    for (let start: number = 0; start <= sorted.length - 2; start += 1) {
        const window: readonly Charge[] = sorted.slice(start);
        const cadence: Cadence | null = bestRule(window, known);
        if (cadence !== null) {
            return { cadence, charges: window };
        }
    }
    return null;
}
