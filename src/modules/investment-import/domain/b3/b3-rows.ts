import { IgnoredLine, IgnoreReason, RejectedLine, RejectReason } from '../investment-statement.types';
import { isBlankRow, RawRow, RawTable } from './b3-cells';
import { HeaderMatch } from './b3-columns';

export type RowResult<T> =
    | { readonly kind: 'item'; readonly item: T }
    | { readonly kind: 'ignored'; readonly ignored: IgnoredLine }
    | { readonly kind: 'rejected'; readonly rejected: RejectedLine };

export interface Collected<T> {
    readonly items: T[];
    readonly ignored: IgnoredLine[];
    readonly rejected: RejectedLine[];
}

export type RowParser<K extends string, T> = (row: RawRow, match: HeaderMatch<K>, sheet: string) => RowResult<T>;

export function accept<T>(item: T): RowResult<T> {
    return { kind: 'item', item };
}

export function ignore<T>(sheet: string, row: RawRow, reason: IgnoreReason, description: string, tradeDate: string | null): RowResult<T> {
    return { kind: 'ignored', ignored: { sheet, line: row.line, reason, description, tradeDate } };
}

export function reject<T>(sheet: string, row: RawRow, reason: RejectReason): RowResult<T> {
    return { kind: 'rejected', rejected: { sheet, line: row.line, reason } };
}

export function collectRows<K extends string, T>(table: RawTable, match: HeaderMatch<K>, parse: RowParser<K, T>): Collected<T> {
    const collected: Collected<T> = { items: [], ignored: [], rejected: [] };
    for (const row of table.rows.slice(match.headerIndex + 1)) {
        if (!isBlankRow(row)) {
            absorb(collected, parse(row, match, table.name));
        }
    }
    return collected;
}

function absorb<T>(collected: Collected<T>, result: RowResult<T>): void {
    if (result.kind === 'item') {
        collected.items.push(result.item);
        return;
    }
    if (result.kind === 'ignored') {
        collected.ignored.push(result.ignored);
        return;
    }
    collected.rejected.push(result.rejected);
}

const PRODUCT_SEPARATOR: string = ' - ';
const NO_CODE: RegExp = /^[-\s]*$/;

export function productCodeOf(product: string): string {
    const code: string = (product.split(PRODUCT_SEPARATOR)[0] ?? '').trim().toUpperCase();
    return NO_CODE.test(code) ? '' : code;
}

export function leadingCodeOf(product: string): string {
    return product.includes(PRODUCT_SEPARATOR) ? productCodeOf(product) : '';
}

export function nullIfEmpty(text: string): string | null {
    return text === '' ? null : text;
}
