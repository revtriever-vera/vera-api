const DAY_MS: number = 86_400_000;

const BRAZIL_UTC_OFFSET: string = '-03:00';

const FORMATTERS: Map<string, Intl.DateTimeFormat> = new Map();

interface DateParts {
    readonly year: number;
    readonly month: number;
    readonly day: number;
    readonly hour: number;
    readonly minute: number;
    readonly second: number;
}

export class DateUtil {
    public static readonly BRAZIL_TIMEZONE: string = 'America/Sao_Paulo';

    public static nowInBrazil(now: Date = new Date()): Date {
        const parts: DateParts = DateUtil.partsIn(DateUtil.BRAZIL_TIMEZONE, now);
        return new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    }

    public static todayInBrazil(now: Date = new Date()): string {
        return DateUtil.localDateIn(DateUtil.BRAZIL_TIMEZONE, now);
    }

    public static localDateIn(timeZone: string, at: Date = new Date()): string {
        const parts: DateParts = DateUtil.partsIn(timeZone, at);
        return `${String(parts.year)}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
    }

    public static startOfDayIn(timeZone: string, at: Date): Date {
        const today: DateParts = DateUtil.partsIn(timeZone, at);
        return DateUtil.midnightIn(timeZone, Date.UTC(today.year, today.month - 1, today.day));
    }

    public static startOfNextDayIn(timeZone: string, at: Date): Date {
        const today: DateParts = DateUtil.partsIn(timeZone, at);
        return DateUtil.midnightIn(timeZone, Date.UTC(today.year, today.month - 1, today.day + 1));
    }

    public static startOfTodayInBrazil(now: Date = new Date()): Date {
        return new Date(`${DateUtil.todayInBrazil(now)}T00:00:00${BRAZIL_UTC_OFFSET}`);
    }

    public static addDays(date: Date, days: number): Date {
        const result: Date = new Date(date);
        result.setUTCDate(result.getUTCDate() + days);
        return result;
    }

    public static addHours(date: Date, hours: number): Date {
        return new Date(date.getTime() + hours * 3_600_000);
    }

    public static addMinutes(date: Date, minutes: number): Date {
        return new Date(date.getTime() + minutes * 60_000);
    }

    public static subtractHours(date: Date, hours: number): Date {
        return DateUtil.addHours(date, -hours);
    }

    public static onlyDateString(date: Date): string {
        return date.toISOString().slice(0, 10);
    }

    public static onlyLocalDateString(date: Date): string {
        return `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    public static startOfDayUtc(date: Date | string): Date {
        const result: Date = new Date(date);
        result.setUTCHours(0, 0, 0, 0);
        return result;
    }

    public static endOfDayUtc(date: Date | string): Date {
        const result: Date = new Date(date);
        result.setUTCHours(23, 59, 59, 999);
        return result;
    }

    public static differenceInCalendarDays(left: Date, right: Date = new Date()): number {
        const leftDay: number = Date.UTC(left.getFullYear(), left.getMonth(), left.getDate());
        const rightDay: number = Date.UTC(right.getFullYear(), right.getMonth(), right.getDate());
        return Math.floor((rightDay - leftDay) / DAY_MS);
    }

    public static isSameCalendarDay(a: Date | string | null | undefined, b: Date | string | null | undefined): boolean {
        if (DateUtil.isMissing(a) || DateUtil.isMissing(b)) {
            return DateUtil.isMissing(a) && DateUtil.isMissing(b);
        }
        const left: Date = new Date(a);
        const right: Date = new Date(b);
        if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) {
            return false;
        }
        return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
    }

    private static midnightIn(timeZone: string, guess: number): Date {
        const seen: DateParts = DateUtil.partsIn(timeZone, new Date(guess));
        const offset: number = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, seen.second) - guess;
        return new Date(guess - offset);
    }

    private static isMissing(value: Date | string | null | undefined): value is null | undefined {
        return value === null || value === undefined;
    }

    private static formatterFor(timeZone: string): Intl.DateTimeFormat {
        const cached: Intl.DateTimeFormat | undefined = FORMATTERS.get(timeZone);
        if (cached !== undefined) {
            return cached;
        }
        const created: Intl.DateTimeFormat = new Intl.DateTimeFormat('en-US', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        FORMATTERS.set(timeZone, created);
        return created;
    }

    private static partsIn(timeZone: string, now: Date): DateParts {
        const raw: Map<string, string> = new Map(
            DateUtil.formatterFor(timeZone)
                .formatToParts(now)
                .map((part: Intl.DateTimeFormatPart) => [part.type, part.value])
        );
        const hour: number = Number(raw.get('hour') ?? '0');
        return {
            year: Number(raw.get('year') ?? '0'),
            month: Number(raw.get('month') ?? '0'),
            day: Number(raw.get('day') ?? '0'),
            hour: hour === 24 ? 0 : hour,
            minute: Number(raw.get('minute') ?? '0'),
            second: Number(raw.get('second') ?? '0')
        };
    }
}
