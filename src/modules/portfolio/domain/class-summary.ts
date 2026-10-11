import { Decimal, DecimalUtil } from '../../../shared/utils/decimal.util';
import { deviationStatusOf } from './deviation-status';
import { BPS_TOTAL, ClassSummary, DEVIATION_STATUSES, Holding, LargestDeviation, SourceClass } from './portfolio.types';

export interface ClassSummaryInput {
    readonly classes: readonly SourceClass[];
    readonly holdings: readonly Pick<Holding, 'classId' | 'valueMinor'>[];
    readonly totalMinor: number;
    readonly toleranceBps: number;
}

interface ClassTotals {
    readonly valueMinor: number;
    readonly count: number;
}

function sumOf(values: readonly number[]): number {
    return values.reduce((total: number, value: number) => total + value, 0);
}

function rawShares(values: readonly number[], totalMinor: number): Decimal[] {
    return values.map((value: number): Decimal => DecimalUtil.of(value).mul(BPS_TOTAL).div(totalMinor));
}

function largestRemainder(raw: readonly Decimal[]): number[] {
    const floors: number[] = raw.map((share: Decimal): number => share.floor().toNumber());
    const leftover: number = BPS_TOTAL - sumOf(floors);
    const winners: Set<number> = new Set<number>(
        raw
            .map((share: Decimal, index: number): [number, Decimal] => [index, share.minus(share.floor())])
            .sort((left: [number, Decimal], right: [number, Decimal]) => right[1].cmp(left[1]) || left[0] - right[0])
            .slice(0, Math.max(leftover, 0))
            .map(([index]: [number, Decimal]): number => index)
    );
    return floors.map((floor: number, index: number): number => floor + (winners.has(index) ? 1 : 0));
}

export function sharesBpsOf(values: readonly number[], totalMinor: number): number[] {
    if (totalMinor <= 0) {
        return values.map((): number => 0);
    }
    const raw: Decimal[] = rawShares(values, totalMinor);
    const rounded: number[] = raw.map((share: Decimal): number => DecimalUtil.roundHalfUpToInteger(share));
    const exact: boolean = sumOf(values) === totalMinor;
    return exact && sumOf(rounded) !== BPS_TOTAL ? largestRemainder(raw) : rounded;
}

export function targetValueOf(targetBps: number, totalMinor: number): number {
    return DecimalUtil.roundHalfUpToInteger(DecimalUtil.of(targetBps).div(BPS_TOTAL).mul(totalMinor));
}

function valueByClass(holdings: ClassSummaryInput['holdings']): Map<string, ClassTotals> {
    const grouped: Map<string, ClassTotals> = new Map<string, ClassTotals>();
    for (const holding of holdings) {
        if (holding.classId !== null) {
            const current: ClassTotals = grouped.get(holding.classId) ?? { valueMinor: 0, count: 0 };
            grouped.set(holding.classId, { valueMinor: current.valueMinor + holding.valueMinor, count: current.count + 1 });
        }
    }
    return grouped;
}

function summaryOf(item: SourceClass, valueMinor: number, shareBps: number, input: ClassSummaryInput): ClassSummary {
    const deviationBps: number = shareBps - item.targetBps;
    return {
        classId: item.id,
        systemKey: item.systemKey,
        name: item.name,
        displayName: item.displayName,
        colorKey: item.colorKey,
        sortOrder: item.sortOrder,
        valueMinor,
        shareBps,
        targetBps: item.targetBps,
        deviationBps,
        status: deviationStatusOf(deviationBps, input.toleranceBps),
        gapMinor: targetValueOf(item.targetBps, input.totalMinor) - valueMinor,
        holdingsCount: 0
    };
}

export function summarizeClasses(input: ClassSummaryInput): ClassSummary[] {
    const ordered: SourceClass[] = [...input.classes].sort((left: SourceClass, right: SourceClass) => left.sortOrder - right.sortOrder);
    const grouped: Map<string, ClassTotals> = valueByClass(input.holdings);
    const values: number[] = ordered.map((item: SourceClass): number => grouped.get(item.id)?.valueMinor ?? 0);
    const shares: number[] = sharesBpsOf(values, input.totalMinor);
    return ordered.map((item: SourceClass, index: number): ClassSummary => ({
        ...summaryOf(item, values[index] ?? 0, shares[index] ?? 0, input),
        holdingsCount: grouped.get(item.id)?.count ?? 0
    }));
}

function isWorse(candidate: ClassSummary, current: ClassSummary): boolean {
    const byDeviation: number = Math.abs(candidate.deviationBps) - Math.abs(current.deviationBps);
    const byGap: number = Math.abs(candidate.gapMinor) - Math.abs(current.gapMinor);
    const bySort: number = current.sortOrder - candidate.sortOrder;
    return (byDeviation || byGap || bySort) > 0;
}

export function largestDeviationOf(classes: readonly ClassSummary[], totalMinor: number): LargestDeviation | null {
    if (totalMinor <= 0 || classes.length === 0) {
        return null;
    }
    const worst: ClassSummary = classes.reduce((current: ClassSummary, candidate: ClassSummary) =>
        isWorse(candidate, current) ? candidate : current
    );
    return { classId: worst.classId, deviationBps: worst.deviationBps, gapMinor: worst.gapMinor, status: worst.status };
}

export function outsideCountOf(classes: readonly ClassSummary[]): number {
    return classes.filter((item: ClassSummary): boolean => item.status !== DEVIATION_STATUSES.within).length;
}
