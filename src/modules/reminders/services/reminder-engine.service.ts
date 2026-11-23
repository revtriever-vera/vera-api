import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { QueuePublisherPort } from '../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES } from '../../../shared/constants/queues.constants';
import { remindersConfig } from '../config/reminders.config';
import { ReminderDomain } from '../domain/reminder.domain';
import { ReminderLimitReachedError } from '../domain/reminders.errors';
import {
    CancelReason,
    CancelResult,
    CancelScope,
    FIRE_ATTEMPTS,
    FIRE_BACKOFF_MS,
    FirePayload,
    NewReminderInput,
    OCCURRENCE_KINDS,
    OccurrenceKind,
    REMINDER_KINDS,
    REMINDER_STATUSES,
    Reminder,
    ReminderOccurrence,
    SNOOZE_MS,
    fireJobIdOf
} from '../domain/reminders.types';
import { TimeOfDay, nextMonthlyAt, parseTimeOfDay, tomorrowAt } from '../domain/schedule';
import { RemindersLogService } from './reminders-log.service';

const FALLBACK_TIME: TimeOfDay = { hour: 9, minute: 0 };

@Injectable()
export class ReminderEngineService {
    public constructor(
        private readonly domain: ReminderDomain,
        private readonly publisher: QueuePublisherPort,
        private readonly logs: RemindersLogService,
        @Inject(remindersConfig.KEY) private readonly config: ConfigType<typeof remindersConfig>
    ) {}

    public async assertRoom(userId: string): Promise<void> {
        if ((await this.domain.countActive(userId)) >= this.config.REMINDERS_MAX_ACTIVE) {
            throw new ReminderLimitReachedError(this.config.REMINDERS_MAX_ACTIVE);
        }
    }

    public async hasRoom(userId: string): Promise<boolean> {
        return (await this.domain.countActive(userId)) < this.config.REMINDERS_MAX_ACTIVE;
    }

    public maxActive(): number {
        return this.config.REMINDERS_MAX_ACTIVE;
    }

    @UsingTransaction()
    public async create(input: NewReminderInput, now: Date = new Date()): Promise<Reminder> {
        await this.assertRoom(input.userId);
        const firstAt: Date =
            input.kind === REMINDER_KINDS.once && input.onceAt !== null
                ? input.onceAt
                : nextMonthlyAt(input.timezone, input.dayOfMonth ?? 1, this.timeOf(input.timeOfDay), now);
        const created: { reminder: Reminder; occurrence: ReminderOccurrence } = await this.domain.create(input, firstAt);
        await this.publish(created.occurrence, now);
        this.logs.created(input.kind);
        return created.reminder;
    }

    @UsingTransaction()
    public async cancel(scope: CancelScope | { readonly id: string }, reason: CancelReason): Promise<number> {
        const result: CancelResult = await this.domain.cancel(scope, reason);
        for (const occurrence of result.occurrences) {
            await this.publisher.remove(QUEUES.reminders, fireJobIdOf(occurrence.reminderId, occurrence.occurrenceAt));
        }
        if (result.reminders > 0) {
            this.logs.canceled(reason, result.reminders);
        }
        return result.reminders;
    }

    public async advance(reminder: Reminder, occurrence: ReminderOccurrence, now: Date): Promise<void> {
        if (occurrence.kind !== OCCURRENCE_KINDS.regular || reminder.status !== REMINDER_STATUSES.active) {
            return;
        }
        if (reminder.kind === REMINDER_KINDS.once) {
            await this.domain.finish(reminder.id);
            return;
        }
        const after: Date = occurrence.occurrenceAt.getTime() > now.getTime() ? occurrence.occurrenceAt : now;
        const next: Date = nextMonthlyAt(reminder.timezone, reminder.dayOfMonth ?? 1, this.timeOf(reminder.timeOfDay), after);
        await this.scheduleAt(reminder.id, next, OCCURRENCE_KINDS.regular, now);
    }

    public async snoozeForOneHour(reminder: Reminder, now: Date): Promise<void> {
        await this.scheduleAt(reminder.id, new Date(now.getTime() + SNOOZE_MS), OCCURRENCE_KINDS.snooze, now);
    }

    public async snoozeUntilTomorrow(reminder: Reminder, now: Date): Promise<string> {
        const time: TimeOfDay = this.timeOf(reminder.timeOfDay);
        await this.scheduleAt(reminder.id, tomorrowAt(reminder.timezone, time, now), OCCURRENCE_KINDS.snooze, now);
        return `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
    }

    public async publish(occurrence: ReminderOccurrence, now: Date): Promise<void> {
        const payload: FirePayload = { occurrenceId: occurrence.id };
        await this.publisher.publish(QUEUES.reminders, MESSAGE_TYPES.remindersFireRequested, payload, {
            jobId: fireJobIdOf(occurrence.reminderId, occurrence.occurrenceAt),
            delayMs: Math.max(0, occurrence.occurrenceAt.getTime() - now.getTime()),
            attempts: FIRE_ATTEMPTS,
            backoffDelayMs: FIRE_BACKOFF_MS,
            retryFailed: true
        });
    }

    private async scheduleAt(reminderId: string, at: Date, kind: OccurrenceKind, now: Date): Promise<void> {
        const occurrence: ReminderOccurrence | null = await this.domain.schedule(reminderId, at, kind);
        if (occurrence !== null) {
            await this.publish(occurrence, now);
        }
    }

    private timeOf(timeOfDay: string): TimeOfDay {
        return parseTimeOfDay(timeOfDay) ?? FALLBACK_TIME;
    }
}
