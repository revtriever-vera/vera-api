import { mean, median } from './recurring-math';
import { FIXED_ABSOLUTE_TOLERANCE_MINOR, FIXED_RELATIVE_TOLERANCE, VALUE_MODES, VARIABLE_TOLERANCE, ValueMode } from './recurring.types';

export interface AmountProfile {
    readonly mode: ValueMode;
    readonly typicalAmountMinor: number;
    readonly minAmountMinor: number;
    readonly maxAmountMinor: number;
}

const FIXED_WINDOW: number = 3;

function spreadOf(values: readonly number[]): number {
    return Math.max(...values) - Math.min(...values);
}

export function isSteady(values: readonly number[]): boolean {
    const tolerance: number = Math.max(FIXED_ABSOLUTE_TOLERANCE_MINOR, FIXED_RELATIVE_TOLERANCE * median(values));
    return spreadOf(values) <= tolerance;
}

function isFixed(amounts: readonly number[]): boolean {
    if (isSteady(amounts.slice(-FIXED_WINDOW))) {
        return true;
    }
    const beforeLast: readonly number[] = amounts.slice(-FIXED_WINDOW - 1, -1);
    return beforeLast.length >= 2 && isSteady(beforeLast);
}

export function profileAmounts(amounts: readonly number[]): AmountProfile | null {
    const minAmountMinor: number = Math.min(...amounts);
    const maxAmountMinor: number = Math.max(...amounts);
    if (isFixed(amounts)) {
        return { mode: VALUE_MODES.fixed, typicalAmountMinor: amounts.at(-1) ?? 0, minAmountMinor, maxAmountMinor };
    }
    if (spreadOf(amounts) > VARIABLE_TOLERANCE * median(amounts)) {
        return null;
    }
    return { mode: VALUE_MODES.variable, typicalAmountMinor: mean(amounts.slice(-FIXED_WINDOW)), minAmountMinor, maxAmountMinor };
}
