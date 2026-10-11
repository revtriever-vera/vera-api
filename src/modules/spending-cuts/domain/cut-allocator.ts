import { CutAllocation, CutCandidate, CutPlan } from './spending-cuts.types';

interface Share {
    readonly candidate: CutCandidate;
    readonly excessMinor: number;
    readonly numerator: bigint;
    readonly floor: bigint;
    readonly remainder: bigint;
}

const ZERO: bigint = 0n;
const TWO: bigint = 2n;

function excessOf(candidate: CutCandidate): number {
    return candidate.averageMinor === null ? 0 : Math.max(0, candidate.spentMinor - candidate.averageMinor);
}

function byTieBreak(left: Share, right: Share): number {
    if (left.remainder !== right.remainder) {
        return left.remainder > right.remainder ? -1 : 1;
    }
    if (left.candidate.spentMinor !== right.candidate.spentMinor) {
        return right.candidate.spentMinor - left.candidate.spentMinor;
    }
    return left.candidate.tieKey.localeCompare(right.candidate.tieKey, 'en') || left.candidate.key.localeCompare(right.candidate.key, 'en');
}

function numeratorOf(candidate: CutCandidate, excess: number, gap: bigint, excessTotal: bigint, spentTotal: bigint): bigint {
    if (gap <= excessTotal) {
        return BigInt(excess) * gap;
    }
    const ideal: bigint = BigInt(excess) * spentTotal + (gap - excessTotal) * BigInt(candidate.spentMinor);
    const cap: bigint = BigInt(candidate.spentMinor) * spentTotal;
    return ideal < cap ? ideal : cap;
}

function emptyPlan(candidates: readonly CutCandidate[]): CutPlan {
    const allocations: CutAllocation[] = candidates.map((candidate: CutCandidate): CutAllocation => ({
        key: candidate.key,
        excessMinor: excessOf(candidate),
        cutMinor: 0
    }));
    return {
        totalCutMinor: 0,
        excessTotalMinor: allocations.reduce((sum: number, item: CutAllocation): number => sum + item.excessMinor, 0),
        allocations
    };
}

function sumOf(values: readonly bigint[]): bigint {
    return values.reduce((sum: bigint, value: bigint): bigint => sum + value, ZERO);
}

function sharesOf(candidates: readonly CutCandidate[], gap: bigint, excessTotal: bigint, spentTotal: bigint): readonly Share[] {
    const denominator: bigint = gap <= excessTotal ? excessTotal : spentTotal;
    return candidates.map((candidate: CutCandidate): Share => {
        const excessMinor: number = excessOf(candidate);
        const numerator: bigint = numeratorOf(candidate, excessMinor, gap, excessTotal, spentTotal);
        return { candidate, excessMinor, numerator, floor: numerator / denominator, remainder: numerator % denominator };
    });
}

function bonusKeysOf(shares: readonly Share[], count: number): ReadonlySet<string> {
    const ranked: Share[] = [...shares].sort(byTieBreak).slice(0, Math.max(0, count));
    return new Set<string>(ranked.map((share: Share): string => share.candidate.key));
}

export function allocateCuts(gapMinor: number, candidates: readonly CutCandidate[]): CutPlan {
    const spentTotal: bigint = sumOf(candidates.map((item: CutCandidate): bigint => BigInt(item.spentMinor)));
    if (gapMinor <= 0 || spentTotal === ZERO) {
        return emptyPlan(candidates);
    }
    const gap: bigint = BigInt(gapMinor);
    const excessTotal: bigint = sumOf(candidates.map((item: CutCandidate): bigint => BigInt(excessOf(item))));
    const denominator: bigint = gap <= excessTotal ? excessTotal : spentTotal;
    const shares: readonly Share[] = sharesOf(candidates, gap, excessTotal, spentTotal);
    const totalCut: bigint = (TWO * sumOf(shares.map((share: Share): bigint => share.numerator)) + denominator) / (TWO * denominator);
    const bonusKeys: ReadonlySet<string> = bonusKeysOf(shares, Number(totalCut - sumOf(shares.map((share: Share): bigint => share.floor))));
    return {
        totalCutMinor: Number(totalCut),
        excessTotalMinor: Number(excessTotal),
        allocations: shares.map((share: Share): CutAllocation => ({
            key: share.candidate.key,
            excessMinor: share.excessMinor,
            cutMinor: Number(share.floor) + (bonusKeys.has(share.candidate.key) ? 1 : 0)
        }))
    };
}
