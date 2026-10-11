import { toMinor } from '../../../shared/utils/decimal.util';
import { DateFormat } from './statement-import.types';

export type DecimalMode = ',' | '.' | 'auto';

const MAX_INTEGER_DIGITS: number = 15;
const TWO_DIGIT_YEAR_BASE: number = 2000;
const CURRENCY_NOISE: RegExp = /\s|R\$|\$|BRL|USD|EUR/gi;
const SIGNED_NUMBER: RegExp = /^([+-]?)(\d[\d.,]*)([+-]?)$/;
const PLAIN_DECIMAL: RegExp = /^\d+(\.\d+)?$/;
const OTHER_SEPARATOR: Readonly<Record<',' | '.', ',' | '.'>> = { ',': '.', '.': ',' };
const OFX_DATE: RegExp = /^(\d{4})(\d{2})(\d{2})/;
const DATE_PATTERNS: Readonly<Record<DateFormat, RegExp>> = {
    'dd/MM/yyyy': /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    'yyyy-MM-dd': /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
    'MM/dd/yyyy': /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    'dd/MM/yy': /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/
};

export function isoDateOf(year: number, month: number, day: number): string | null {
    const parsed: Date = new Date(Date.UTC(year, month - 1, day));
    const valid: boolean = parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
    return valid && year >= 1900 && year <= 2999 ? parsed.toISOString().slice(0, 10) : null;
}

interface DateParts {
    readonly year: number;
    readonly month: number;
    readonly day: number;
}

function partsOf(match: RegExpExecArray, format: DateFormat): DateParts {
    const first: number = Number(match[1]);
    const second: number = Number(match[2]);
    const third: number = Number(match[3]);
    if (format === 'yyyy-MM-dd') {
        return { year: first, month: second, day: third };
    }
    if (format === 'MM/dd/yyyy') {
        return { year: third, month: first, day: second };
    }
    return { year: format === 'dd/MM/yy' ? TWO_DIGIT_YEAR_BASE + third : third, month: second, day: first };
}

export function parseDateWith(raw: string, format: DateFormat): string | null {
    const match: RegExpExecArray | null = DATE_PATTERNS[format].exec(raw.trim());
    if (match === null) {
        return null;
    }
    const parts: DateParts = partsOf(match, format);
    return isoDateOf(parts.year, parts.month, parts.day);
}

export function parseOfxDate(raw: string): string | null {
    const match: RegExpExecArray | null = OFX_DATE.exec(raw.trim());
    return match === null ? null : isoDateOf(Number(match[1]), Number(match[2]), Number(match[3]));
}

function occurrencesOf(text: string, char: string): number {
    return text.split(char).length - 1;
}

function decimalSeparatorOf(digits: string, mode: DecimalMode): ',' | '.' {
    if (mode !== 'auto') {
        return mode;
    }
    const lastComma: number = digits.lastIndexOf(',');
    const lastDot: number = digits.lastIndexOf('.');
    if (lastComma >= 0 && lastDot >= 0) {
        return lastComma > lastDot ? ',' : '.';
    }
    const only: ',' | '.' = lastComma >= 0 ? ',' : '.';
    return occurrencesOf(digits, only) > 1 ? OTHER_SEPARATOR[only] : only;
}

function canonicalDecimal(digits: string, mode: DecimalMode): string | null {
    const decimal: ',' | '.' = decimalSeparatorOf(digits, mode);
    const thousands: string = decimal === ',' ? '.' : ',';
    if (occurrencesOf(digits, decimal) > 1) {
        return null;
    }
    const plain: string = digits.split(thousands).join('').replace(decimal, '.');
    return PLAIN_DECIMAL.test(plain) && (plain.split('.')[0] ?? '').length <= MAX_INTEGER_DIGITS ? plain : null;
}

export function parseAmountMinor(raw: string, mode: DecimalMode, currency: string): number | null {
    const match: RegExpExecArray | null = SIGNED_NUMBER.exec(raw.replace(CURRENCY_NOISE, ''));
    if (match === null) {
        return null;
    }
    const plain: string | null = canonicalDecimal(match[2] ?? '', mode);
    if (plain === null) {
        return null;
    }
    const negative: boolean = match[1] === '-' || match[3] === '-';
    try {
        const minor: number = toMinor(plain, currency);
        return negative && minor !== 0 ? -minor : minor;
    } catch {
        return null;
    }
}

export function clip(text: string, max: number): string {
    return text.trim().slice(0, max);
}

export function joinDescription(name: string, memo: string, max: number): string {
    const left: string = name.trim();
    const right: string = memo.trim();
    const lowerLeft: string = left.toLowerCase();
    const lowerRight: string = right.toLowerCase();
    if (right === '' || lowerLeft.includes(lowerRight)) {
        return clip(left, max);
    }
    if (left === '' || lowerRight.includes(lowerLeft)) {
        return clip(right, max);
    }
    return clip(`${left} ${right}`, max);
}

export function lastDigits(text: string | undefined, count: number): string | null {
    const digits: string = (text ?? '').replace(/\D/g, '');
    return digits.length >= count ? digits.slice(-count) : null;
}
