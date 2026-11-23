import { DEFAULT_TIME_OF_DAY, TEXT_LIMIT } from './reminders.types';

export type LocalParts = {
    readonly year: number;
    readonly month: number;
    readonly day: number;
    readonly hour: number;
    readonly minute: number;
};

export type TimeOfDay = { readonly hour: number; readonly minute: number };

const TIME_PATTERN: RegExp = /^([01]\d|2[0-3]):([0-5]\d)$/;
const LOCAL_AT_PATTERN: RegExp = /^(\d{4})-(\d{2})-(\d{2})(?:T([01]\d|2[0-3]):([0-5]\d))?$/;
const LINK_PATTERN: RegExp = /(?:https?:\/\/|www\.)\S+/gi;
const DOMAIN_PATTERN: RegExp = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|app|br|co|me|ly|gl)\b\S*/gi;

const FORMATTERS: Map<string, Intl.DateTimeFormat> = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
    const known: Intl.DateTimeFormat | undefined = FORMATTERS.get(timeZone);
    if (known !== undefined) {
        return known;
    }
    const created: Intl.DateTimeFormat = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    });
    FORMATTERS.set(timeZone, created);
    return created;
}

export function localPartsIn(timeZone: string, at: Date): LocalParts {
    const raw: Map<string, string> = new Map<string, string>(
        formatterFor(timeZone)
            .formatToParts(at)
            .map((part: Intl.DateTimeFormatPart): [string, string] => [part.type, part.value])
    );
    return {
        year: Number(raw.get('year')),
        month: Number(raw.get('month')),
        day: Number(raw.get('day')),
        hour: Number(raw.get('hour')),
        minute: Number(raw.get('minute'))
    };
}

function offsetAt(timeZone: string, instant: number): number {
    const parts: LocalParts = localPartsIn(timeZone, new Date(instant));
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - Math.floor(instant / 60_000) * 60_000;
}

export function zonedTimeToUtc(timeZone: string, parts: LocalParts): Date {
    const wanted: number = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    const first: number = wanted - offsetAt(timeZone, wanted);
    const second: number = wanted - offsetAt(timeZone, first);
    return new Date(second);
}

export function daysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function parseTimeOfDay(time: string | undefined): TimeOfDay | null {
    const match: RegExpExecArray | null = TIME_PATTERN.exec(time ?? DEFAULT_TIME_OF_DAY);
    return match === null ? null : { hour: Number(match[1]), minute: Number(match[2]) };
}

export function timeLabelOf(time: TimeOfDay): string {
    return `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

export function parseLocalAt(raw: string, fallback: TimeOfDay): LocalParts | null {
    const match: RegExpExecArray | null = LOCAL_AT_PATTERN.exec(raw.trim());
    if (match === null) {
        return null;
    }
    const year: number = Number(match[1]);
    const month: number = Number(match[2]);
    const day: number = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
        return null;
    }
    const hour: number = match[4] === undefined ? fallback.hour : Number(match[4]);
    const minute: number = match[5] === undefined ? fallback.minute : Number(match[5]);
    return { year, month, day, hour, minute };
}

function monthlyCandidate(timeZone: string, year: number, month: number, dayOfMonth: number, time: TimeOfDay): Date {
    const day: number = Math.min(dayOfMonth, daysInMonth(year, month));
    return zonedTimeToUtc(timeZone, { year, month, day, hour: time.hour, minute: time.minute });
}

export function nextMonthlyAt(timeZone: string, dayOfMonth: number, time: TimeOfDay, after: Date): Date {
    const today: LocalParts = localPartsIn(timeZone, after);
    const thisMonth: Date = monthlyCandidate(timeZone, today.year, today.month, dayOfMonth, time);
    if (thisMonth.getTime() > after.getTime()) {
        return thisMonth;
    }
    const nextYear: number = today.month === 12 ? today.year + 1 : today.year;
    const nextMonth: number = today.month === 12 ? 1 : today.month + 1;
    return monthlyCandidate(timeZone, nextYear, nextMonth, dayOfMonth, time);
}

export function tomorrowAt(timeZone: string, time: TimeOfDay, now: Date): Date {
    const today: LocalParts = localPartsIn(timeZone, now);
    const next: Date = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
    return zonedTimeToUtc(timeZone, {
        year: next.getUTCFullYear(),
        month: next.getUTCMonth() + 1,
        day: next.getUTCDate(),
        hour: time.hour,
        minute: time.minute
    });
}

export function clippedTextOf(raw: string): string {
    const plain: string = raw.replaceAll(LINK_PATTERN, ' ').replaceAll(DOMAIN_PATTERN, ' ').replaceAll(/\s+/g, ' ').trim();
    return plain.slice(0, TEXT_LIMIT).trim();
}
