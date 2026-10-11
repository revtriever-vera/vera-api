import { BPS_TOTAL } from './portfolio.types';

export interface TargetCandidate {
    readonly id: string;
    readonly valueMinor: number;
    readonly storedBps: number;
}

function byValueThenId(left: TargetCandidate, right: TargetCandidate): number {
    return right.valueMinor - left.valueMinor || left.id.localeCompare(right.id);
}

function equalSplit(ordered: readonly TargetCandidate[]): Map<string, number> {
    const base: number = Math.floor(BPS_TOTAL / ordered.length);
    const remainder: number = BPS_TOTAL - base * ordered.length;
    return new Map<string, number>(
        ordered.map((item: TargetCandidate, index: number): [string, number] => [item.id, base + (index < remainder ? 1 : 0)])
    );
}

export function effectiveAssetTargets(items: readonly TargetCandidate[]): Map<string, number> {
    if (items.length === 0) {
        return new Map<string, number>();
    }
    const storedSum: number = items.reduce((total: number, item: TargetCandidate) => total + item.storedBps, 0);
    if (storedSum === 0) {
        return equalSplit([...items].sort(byValueThenId));
    }
    return new Map<string, number>(items.map((item: TargetCandidate): [string, number] => [item.id, item.storedBps]));
}
