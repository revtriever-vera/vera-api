import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { ReminderDomain } from '../domain/reminder.domain';
import { ReminderNotFoundError } from '../domain/reminders.errors';
import { CANCEL_REASONS, Reminder } from '../domain/reminders.types';
import { ReminderEngineService } from '../services/reminder-engine.service';
import { ReminderItem, RemindersList } from '../validation/reminders.schemas';

@Injectable()
export class RemindersApplication {
    public constructor(
        private readonly domain: ReminderDomain,
        private readonly engine: ReminderEngineService,
        private readonly context: AppContext
    ) {}

    public async list(): Promise<RemindersList> {
        const reminders: Reminder[] = await this.domain.listActive(this.userId());
        const next: Map<string, Date> = await this.domain.nextAtOf(reminders.map((reminder: Reminder): string => reminder.id));
        return { items: reminders.map((reminder: Reminder): ReminderItem => this.itemOf(reminder, next.get(reminder.id) ?? null)) };
    }

    public async remove(id: string): Promise<void> {
        const reminder: Reminder | null = await this.domain.activeOfUser(id, this.userId());
        if (reminder === null) {
            throw new ReminderNotFoundError();
        }
        await this.engine.cancel({ id: reminder.id }, CANCEL_REASONS.user);
    }

    private itemOf(reminder: Reminder, nextAt: Date | null): ReminderItem {
        return {
            id: reminder.id,
            text: reminder.text,
            kind: reminder.kind === 'monthly' ? 'monthly' : 'once',
            nextAt: nextAt?.toISOString() ?? null,
            dayOfMonth: reminder.dayOfMonth,
            time: reminder.timeOfDay,
            createdVia: 'whatsapp'
        };
    }

    private userId(): string {
        return this.context.get().userId ?? '';
    }
}
