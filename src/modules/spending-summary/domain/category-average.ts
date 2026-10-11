import { DecimalUtil } from '../../../shared/utils/decimal.util';
import { addMonths } from './month';
import { AVERAGE_WINDOW_MONTHS, BPS_BASE, CategoryAverage } from './spending-summary.types';

export function averageWindow(month: string, monthsWithData: readonly string[]): readonly string[] {
    const present: ReadonlySet<string> = new Set<string>(monthsWithData);
    return Array.from({ length: AVERAGE_WINDOW_MONTHS }, (_: unknown, index: number): string => addMonths(month, -(index + 1))).filter(
        (candidate: string): boolean => present.has(candidate)
    );
}

export function categoryAverage(spentMinor: number, monthlySpent: readonly number[]): CategoryAverage {
    if (monthlySpent.length === 0) {
        return { averageMinor: null, deltaBps: null, isNew: false };
    }
    const total: number = monthlySpent.reduce((sum: number, value: number): number => sum + value, 0);
    const averageMinor: number = DecimalUtil.roundHalfUpToInteger(DecimalUtil.of(total).div(monthlySpent.length));
    if (averageMinor > 0) {
        const delta: number = DecimalUtil.roundHalfUpToInteger(
            DecimalUtil.of(spentMinor - averageMinor)
                .mul(BPS_BASE)
                .div(averageMinor)
        );
        return { averageMinor, deltaBps: delta, isNew: false };
    }
    return { averageMinor, deltaBps: null, isNew: averageMinor === 0 && spentMinor > 0 };
}
