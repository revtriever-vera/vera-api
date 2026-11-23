import { Injectable } from '@nestjs/common';
import { IdUtil } from '../../../shared/utils/id.util';
import { ReminderOccurrencesRepository, OccurrencePatch } from '../repositories/reminder-occurrences.repository';
import { RemindersRepository } from '../repositories/reminders.repository';
import {
    CancelReason,
    CancelResult,
    CancelScope,
    CanceledOccurrence,
    DueOccurrenceRef,
    NewReminderInput,
    OCCURRENCE_KINDS,
    OCCURRENCE_STATUSES,
    OccurrenceKind,
    OccurrenceStatus,
    REMINDER_KINDS,
    REMINDER_STATUSES,
    Reminder,
    ReminderOccurrence
} from './reminders.types';

export type CreatedReminder = { readonly reminder: Reminder; readonly occurrence: ReminderOccurrence };

@Injectable()
export class ReminderDomain {
    public constructor(
        private readonly reminders: RemindersRepository,
        private readonly occurrences: ReminderOccurrencesRepository
    ) {}

    public async create(input: NewReminderInput, firstAt: Date): Promise<CreatedReminder> {
        const reminder: Reminder = await this.reminders.create({
            id: IdUtil.newId(),
            userId: input.userId,
            linkId: input.linkId,
            text: input.text,
            kind: input.kind,
            onceAt: input.kind === REMINDER_KINDS.once ? firstAt : null,
            dayOfMonth: input.dayOfMonth,
            timeOfDay: input.timeOfDay,
            timezone: input.timezone,
            status: REMINDER_STATUSES.active
        });
        const occurrence: ReminderOccurrence | null = await this.occurrences.schedule(reminder.id, firstAt, OCCURRENCE_KINDS.regular);
        if (occurrence === null) {
            throw new Error('reminder first occurrence was not scheduled');
        }
        return { reminder, occurrence };
    }

    public async countActive(userId: string): Promise<number> {
        return this.reminders.countActive(userId);
    }

    public async listActive(userId: string): Promise<Reminder[]> {
        return this.reminders.listActive(userId);
    }

    public async activeOfUser(id: string, userId: string): Promise<Reminder | null> {
        return this.reminders.findActiveOfUser(id, userId);
    }

    public async byId(id: string): Promise<Reminder | null> {
        return this.reminders.findById(id);
    }

    public async listAll(offset: number, limit: number): Promise<Reminder[]> {
        return this.reminders.listAll(offset, limit);
    }

    public async nextAtOf(reminderIds: readonly string[]): Promise<Map<string, Date>> {
        return this.occurrences.nextScheduledAt(reminderIds);
    }

    public async cancel(scope: CancelScope | { readonly id: string }, reason: CancelReason): Promise<CancelResult> {
        const canceled: Reminder[] = await this.reminders.cancel(scope, reason);
        const occurrences: CanceledOccurrence[] = await this.occurrences.cancelScheduled(
            canceled.map((reminder: Reminder): string => reminder.id)
        );
        return { reminders: canceled.length, occurrences };
    }

    public async finish(id: string): Promise<boolean> {
        return this.reminders.finish(id);
    }

    public async occurrence(id: string): Promise<ReminderOccurrence | null> {
        return this.occurrences.findOneById(id);
    }

    public async occurrenceOfMessage(messageId: string): Promise<ReminderOccurrence | null> {
        return this.occurrences.findOfMessage(messageId);
    }

    public async latestSent(reminderId: string): Promise<ReminderOccurrence | null> {
        return this.occurrences.latestSent(reminderId);
    }

    public async schedule(reminderId: string, at: Date, kind: OccurrenceKind): Promise<ReminderOccurrence | null> {
        return this.occurrences.schedule(reminderId, at, kind);
    }

    public async claim(id: string): Promise<ReminderOccurrence | null> {
        return this.occurrences.claim(id);
    }

    public async settle(id: string, from: OccurrenceStatus, patch: OccurrencePatch): Promise<ReminderOccurrence | null> {
        return this.occurrences.settle(id, from, patch);
    }

    public async markDone(id: string): Promise<ReminderOccurrence | null> {
        return this.occurrences.settle(id, OCCURRENCE_STATUSES.sent, { status: OCCURRENCE_STATUSES.done });
    }

    public async templateSendsBetween(from: Date, before: Date): Promise<number> {
        return this.occurrences.countTemplateSends(from, before);
    }

    public async dueAcrossTenants(before: Date, limit: number): Promise<DueOccurrenceRef[]> {
        return this.occurrences.dueAcrossTenants(before, limit);
    }

    public async countActiveAcrossTenants(): Promise<number> {
        return this.reminders.countActiveAcrossTenants();
    }
}
