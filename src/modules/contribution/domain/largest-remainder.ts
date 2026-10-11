import Decimal from 'decimal.js';

interface Fraction {
    readonly index: number;
    readonly remainder: Decimal;
}

function byRemainderThenIndex(left: Fraction, right: Fraction): number {
    return right.remainder.comparedTo(left.remainder) || left.index - right.index;
}

export function largestRemainder(shares: readonly Decimal[], total: number): readonly number[] {
    const floors: number[] = shares.map((share: Decimal): number => share.floor().toNumber());
    const leftover: number = total - floors.reduce((sum: number, value: number): number => sum + value, 0);
    const ranked: Fraction[] = shares
        .map((share: Decimal, index: number): Fraction => ({ index, remainder: share.minus(share.floor()) }))
        .sort(byRemainderThenIndex);
    const bonus: Set<number> = new Set<number>(ranked.slice(0, Math.max(0, leftover)).map((item: Fraction): number => item.index));
    return floors.map((value: number, index: number): number => value + (bonus.has(index) ? 1 : 0));
}
