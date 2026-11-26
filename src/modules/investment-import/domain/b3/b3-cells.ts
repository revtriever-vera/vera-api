import { decimalStringOf } from '../../../../shared/utils/decimal.util';

export type RawCell = string | number | null;

export interface RawRow {
    readonly line: number;
    readonly cells: readonly RawCell[];
}

export interface RawTable {
    readonly name: string;
    readonly rows: readonly RawRow[];
}

const COMBINING_MARKS: RegExp = /\p{M}/gu;
const NON_ALPHANUMERIC: RegExp = /[^a-z0-9]+/g;
const NUMBER_TEXT: RegExp = /^-?[\d.,]+$/;
const THOUSANDS_ONLY: RegExp = /^-?\d{1,3}(\.\d{3})+$/;
const BR_DATE: RegExp = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/;
const ISO_DATE: RegExp = /^(\d{4})-(\d{2})-(\d{2})/;
const MONEY_NOISE: RegExp = /R\$|\s/g;

export function normalizeText(text: string): string {
    return text.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase().replace(NON_ALPHANUMERIC, ' ').trim();
}

export function textOf(cell: RawCell | undefined): string {
    return cell === null || cell === undefined ? '' : String(cell).trim();
}

function plainNumber(text: string): string | null {
    if (!NUMBER_TEXT.test(text)) {
        return null;
    }
    if (text.includes(',')) {
        return text.replaceAll('.', '').replace(',', '.');
    }
    return THOUSANDS_ONLY.test(text) ? text.replaceAll('.', '') : text;
}

export function decimalOf(cell: RawCell | undefined): string | null {
    if (typeof cell === 'number') {
        return Number.isFinite(cell) ? decimalStringOf(cell) : null;
    }
    const plain: string | null = plainNumber(textOf(cell).replace(MONEY_NOISE, ''));
    if (plain === null) {
        return null;
    }
    try {
        return decimalStringOf(plain);
    } catch {
        return null;
    }
}

function isoOf(year: number, month: number, day: number): string | null {
    const parsed: Date = new Date(Date.UTC(year, month - 1, day));
    const valid: boolean = parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
    return valid ? parsed.toISOString().slice(0, 10) : null;
}

export function dateOf(cell: RawCell | undefined): string | null {
    const text: string = textOf(cell);
    const brazilian: RegExpExecArray | null = BR_DATE.exec(text);
    if (brazilian !== null) {
        return isoOf(Number(brazilian[3]), Number(brazilian[2]), Number(brazilian[1]));
    }
    const iso: RegExpExecArray | null = ISO_DATE.exec(text);
    return iso === null ? null : isoOf(Number(iso[1]), Number(iso[2]), Number(iso[3]));
}

export function isBlankRow(row: RawRow): boolean {
    return row.cells.every((cell: RawCell): boolean => textOf(cell) === '');
}
