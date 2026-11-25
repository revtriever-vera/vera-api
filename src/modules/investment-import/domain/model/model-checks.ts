import { DecimalUtil, mulDecimal, toMinor } from '../../../../shared/utils/decimal.util';
import { LINE_REASONS } from '../investment-import.types';
import { ParsedOperation } from '../investment-statement.types';

const AMOUNT_TOLERANCE_RATIO: string = '0.001';
const MIN_TOLERANCE_MINOR: number = 1;
const EARLIEST_YEAR: number = 1990;
const DATE_PARTS: RegExp = /^(\d{4})-(\d{2})-(\d{2})$/;
const TRADED_KINDS: ReadonlySet<string> = new Set(['buy', 'sell']);

function toleranceOf(minor: number): number {
    return Math.max(MIN_TOLERANCE_MINOR, DecimalUtil.roundHalfUpToInteger(DecimalUtil.of(Math.abs(minor)).mul(AMOUNT_TOLERANCE_RATIO)));
}

function isRealDate(value: string): boolean {
    const parts: RegExpExecArray | null = DATE_PARTS.exec(value);
    if (parts === null) {
        return false;
    }
    const [year, month, day]: number[] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
    const date: Date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
    return date.getUTCFullYear() === year && date.getUTCMonth() === (month ?? 1) - 1 && date.getUTCDate() === day;
}

export function dateCheckOf(tradeDate: string, today: string): string | null {
    const plausible: boolean = isRealDate(tradeDate) && tradeDate <= today && Number(tradeDate.slice(0, 4)) >= EARLIEST_YEAR;
    return plausible ? null : LINE_REASONS.dateOutOfRange;
}

export function amountCheckOf(
    operation: Pick<ParsedOperation, 'kind' | 'quantity' | 'unitPrice' | 'grossMinor' | 'currency'>
): string | null {
    if (!TRADED_KINDS.has(operation.kind)) {
        return null;
    }
    if (operation.unitPrice === null || operation.grossMinor === null) {
        return null;
    }
    const expected: number = toMinor(mulDecimal(operation.quantity, operation.unitPrice), operation.currency);
    return Math.abs(expected - operation.grossMinor) <= toleranceOf(expected) ? null : LINE_REASONS.amountMismatch;
}

export function totalMatches(operations: readonly Pick<ParsedOperation, 'kind' | 'grossMinor'>[], totalMinor: number | null): boolean {
    if (totalMinor === null) {
        return true;
    }
    const traded: readonly Pick<ParsedOperation, 'kind' | 'grossMinor'>[] = operations.filter(
        (operation: Pick<ParsedOperation, 'kind' | 'grossMinor'>): boolean => TRADED_KINDS.has(operation.kind)
    );
    if (traded.some((operation: Pick<ParsedOperation, 'kind' | 'grossMinor'>): boolean => operation.grossMinor === null)) {
        return true;
    }
    const sum: number = traded.reduce(
        (total: number, operation: Pick<ParsedOperation, 'kind' | 'grossMinor'>): number => total + Math.abs(operation.grossMinor ?? 0),
        0
    );
    return Math.abs(sum - Math.abs(totalMinor)) <= toleranceOf(totalMinor) + traded.length;
}
