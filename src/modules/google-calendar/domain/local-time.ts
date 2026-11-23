const WALL_CLOCK: RegExp = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(.*)$/;
const SECONDS: RegExp = /^(:\d{2}(\.\d+)?)?/;
const OFFSET: RegExp = /^(Z|[+-]\d{2}:?\d{2})?$/i;
const OFFSET_PASSES: number = 2;
const MINUTE_MS: number = 60_000;

const formatters: Map<string, Intl.DateTimeFormat> = new Map<string, Intl.DateTimeFormat>();

export interface LocalParts {
    readonly year: number;
    readonly month: number;
    readonly day: number;
    readonly hour: number;
    readonly minute: number;
    readonly weekday: number;
}

function formatterOf(timeZone: string): Intl.DateTimeFormat {
    const known: Intl.DateTimeFormat | undefined = formatters.get(timeZone);
    if (known !== undefined) {
        return known;
    }
    const created: Intl.DateTimeFormat = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        weekday: 'short'
    });
    formatters.set(timeZone, created);
    return created;
}

const WEEKDAYS: readonly string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function localPartsIn(timeZone: string, at: Date): LocalParts {
    const values: Record<string, string> = {};
    for (const part of formatterOf(timeZone).formatToParts(at)) {
        values[part.type] = part.value;
    }
    return {
        year: Number(values['year']),
        month: Number(values['month']),
        day: Number(values['day']),
        hour: Number(values['hour']),
        minute: Number(values['minute']),
        weekday: WEEKDAYS.indexOf(values['weekday'] ?? '')
    };
}

function offsetMsOf(timeZone: string, at: Date): number {
    const parts: LocalParts = localPartsIn(timeZone, at);
    const asUtc: number = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    return asUtc - Math.floor(at.getTime() / MINUTE_MS) * MINUTE_MS;
}

export function zonedToUtc(parts: Omit<LocalParts, 'weekday'>, timeZone: string): Date {
    const wall: number = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    let guess: number = wall;
    for (let pass: number = 0; pass < OFFSET_PASSES; pass += 1) {
        guess = wall - offsetMsOf(timeZone, new Date(guess));
    }
    return new Date(guess);
}

function explicitOffsetMs(text: string): number {
    if (text.toUpperCase() === 'Z') {
        return 0;
    }
    const sign: number = text.startsWith('-') ? -1 : 1;
    const digits: string = text.slice(1).replace(':', '');
    return sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4))) * MINUTE_MS;
}

function offsetPartOf(rest: string): string | null {
    const match: RegExpExecArray | null = OFFSET.exec(rest.replace(SECONDS, '').trim());
    return match === null ? null : (match[1] ?? '');
}

function validWall(parts: Omit<LocalParts, 'weekday'>): boolean {
    return parts.month >= 1 && parts.month <= 12 && parts.day >= 1 && parts.day <= 31 && parts.hour <= 23 && parts.minute <= 59;
}

export function parseWallClock(text: string, timeZone: string): Date | null {
    const match: RegExpExecArray | null = WALL_CLOCK.exec(text.trim());
    const offset: string | null = match === null ? null : offsetPartOf(match[6] ?? '');
    if (match === null || offset === null) {
        return null;
    }
    const parts: Omit<LocalParts, 'weekday'> = {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
        hour: Number(match[4]),
        minute: Number(match[5])
    };
    if (!validWall(parts)) {
        return null;
    }
    const result: Date =
        offset === ''
            ? zonedToUtc(parts, timeZone)
            : new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - explicitOffsetMs(offset));
    return Number.isNaN(result.getTime()) ? null : result;
}
