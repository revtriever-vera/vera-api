import { ReminderInvalidScheduleError } from './reminders.errors';
import { REMINDER_KINDS, ReminderKind } from './reminders.types';
import { LocalParts, TimeOfDay, clippedTextOf, parseLocalAt, parseTimeOfDay, timeLabelOf, zonedTimeToUtc } from './schedule';

export type ReminderRequest = {
    readonly text: string;
    readonly kind: ReminderKind;
    readonly at?: string | undefined;
    readonly dayOfMonth?: number | undefined;
    readonly time?: string | undefined;
};

export type ResolvedReminder = {
    readonly text: string;
    readonly kind: ReminderKind;
    readonly onceAt: Date | null;
    readonly dayOfMonth: number | null;
    readonly timeOfDay: string;
    readonly timezone: string;
};

function requireTime(raw: string | undefined): TimeOfDay {
    const time: TimeOfDay | null = parseTimeOfDay(raw);
    if (time === null) {
        throw new ReminderInvalidScheduleError('time');
    }
    return time;
}

function onceOf(request: ReminderRequest, timeZone: string, now: Date, base: TimeOfDay): { onceAt: Date; timeOfDay: string } {
    const local: LocalParts | null = request.at === undefined ? null : parseLocalAt(request.at, base);
    if (local === null) {
        throw new ReminderInvalidScheduleError('at');
    }
    const onceAt: Date = zonedTimeToUtc(timeZone, local);
    if (onceAt.getTime() <= now.getTime()) {
        throw new ReminderInvalidScheduleError('past');
    }
    return { onceAt, timeOfDay: timeLabelOf({ hour: local.hour, minute: local.minute }) };
}

export function resolveReminder(request: ReminderRequest, timeZone: string, now: Date): ResolvedReminder {
    const text: string = clippedTextOf(request.text);
    if (text.length === 0) {
        throw new ReminderInvalidScheduleError('text');
    }
    const base: TimeOfDay = requireTime(request.time);
    if (request.kind === REMINDER_KINDS.once) {
        const once: { onceAt: Date; timeOfDay: string } = onceOf(request, timeZone, now, base);
        return { text, kind: request.kind, onceAt: once.onceAt, dayOfMonth: null, timeOfDay: once.timeOfDay, timezone: timeZone };
    }
    if (request.dayOfMonth === undefined || request.dayOfMonth < 1 || request.dayOfMonth > 31) {
        throw new ReminderInvalidScheduleError('dayOfMonth');
    }
    return {
        text,
        kind: request.kind,
        onceAt: null,
        dayOfMonth: request.dayOfMonth,
        timeOfDay: timeLabelOf(base),
        timezone: timeZone
    };
}
