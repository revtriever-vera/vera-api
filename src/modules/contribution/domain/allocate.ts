import Decimal from 'decimal.js';
import { DecimalUtil } from '../../../shared/utils/decimal.util';
import { largestRemainder } from './largest-remainder';

export interface AllocationItem {
    readonly key: string;
    readonly currentMinor: number;
    readonly targetBps: number;
}

const BPS_TOTAL: number = 10000;

function sumOf(values: readonly Decimal[]): Decimal {
    return values.reduce((total: Decimal, value: Decimal): Decimal => total.plus(value), DecimalUtil.of(0));
}

function weightsOf(items: readonly AllocationItem[]): Decimal[] {
    const weights: Decimal[] = items.map((item: AllocationItem): Decimal => DecimalUtil.of(item.targetBps));
    return sumOf(weights).isZero() ? items.map((): Decimal => DecimalUtil.of(1)) : weights;
}

function needsOf(items: readonly AllocationItem[], total: Decimal): Decimal[] {
    return items.map((item: AllocationItem): Decimal => {
        const gap: Decimal = total.mul(item.targetBps).div(BPS_TOTAL).minus(item.currentMinor);
        return gap.isNegative() ? DecimalUtil.of(0) : gap;
    });
}

function sharesOf(amount: Decimal, needs: readonly Decimal[], weights: readonly Decimal[]): Decimal[] {
    const weightSum: Decimal = sumOf(weights);
    const sumNeed: Decimal = sumOf(needs);
    if (sumNeed.lte(0)) {
        return weights.map((weight: Decimal): Decimal => amount.mul(weight).div(weightSum));
    }
    if (sumNeed.gte(amount)) {
        return needs.map((need: Decimal): Decimal => amount.mul(need).div(sumNeed));
    }
    const surplus: Decimal = amount.minus(sumNeed);
    return needs.map((need: Decimal, index: number): Decimal => need.plus(surplus.mul(weights[index] ?? 0).div(weightSum)));
}

export function allocate(amountMinor: number, items: readonly AllocationItem[]): readonly number[] {
    if (items.length === 0) {
        return [];
    }
    const current: number = items.reduce((sum: number, item: AllocationItem): number => sum + item.currentMinor, 0);
    const total: Decimal = DecimalUtil.of(current).plus(amountMinor);
    const shares: Decimal[] = sharesOf(DecimalUtil.of(amountMinor), needsOf(items, total), weightsOf(items));
    return largestRemainder(shares, amountMinor);
}
