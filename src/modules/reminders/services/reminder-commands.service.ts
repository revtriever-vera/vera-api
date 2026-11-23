import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { AppLocale } from '../../../shared/i18n/locale';
import { ReminderCommandsPort } from '../../whatsapp-chat/services/reminder-commands.port';
import { ReminderDomain } from '../domain/reminder.domain';
import { ReminderTexts, reminderTextsFor, whenOf } from '../domain/reminder-texts';
import { ButtonAction, CANCEL_REASONS, Reminder, REMINDER_STATUSES, ReminderOccurrence } from '../domain/reminders.types';
import { ReminderEngineService } from './reminder-engine.service';

@Injectable()
export class ReminderCommandsService extends ReminderCommandsPort {
    public constructor(
        private readonly domain: ReminderDomain,
        private readonly engine: ReminderEngineService,
        private readonly context: AppContext
    ) {
        super();
    }

    public async list(locale: AppLocale): Promise<string> {
        const texts: ReminderTexts = reminderTextsFor(locale);
        const reminders: Reminder[] = await this.domain.listActive(this.userId());
        if (reminders.length === 0) {
            return texts.listEmpty;
        }
        const now: Date = new Date();
        const lines: string[] = reminders.map((reminder: Reminder, index: number): string =>
            texts.listItem(index + 1, reminder.text, whenOf(reminder, locale, now))
        );
        return [texts.listHeader, ...lines].join('\n');
    }

    public async remove(index: number, locale: AppLocale): Promise<string> {
        const texts: ReminderTexts = reminderTextsFor(locale);
        const reminder: Reminder | null = await this.atPosition(index);
        if (reminder === null) {
            return texts.positionNotFound(index);
        }
        await this.engine.cancel({ id: reminder.id }, CANCEL_REASONS.user);
        return texts.deleted(reminder.text);
    }

    @UsingTransaction()
    public async apply(action: ButtonAction, reminderId: string, locale: AppLocale): Promise<string> {
        const texts: ReminderTexts = reminderTextsFor(locale);
        const reminder: Reminder | null = await this.domain.byId(reminderId);
        if (reminder === null || reminder.userId !== this.userId() || reminder.status === REMINDER_STATUSES.canceled) {
            return texts.tapGone;
        }
        const sent: ReminderOccurrence | null = await this.domain.latestSent(reminder.id);
        if (sent === null) {
            return texts.tapHandled;
        }
        await this.domain.markDone(sent.id);
        return this.reply(action, reminder, texts);
    }

    private async reply(action: ButtonAction, reminder: Reminder, texts: ReminderTexts): Promise<string> {
        const now: Date = new Date();
        if (action === 'snooze1h') {
            await this.engine.snoozeForOneHour(reminder, now);
            return texts.tapSnooze;
        }
        if (action === 'tomorrow') {
            return texts.tapTomorrow(await this.engine.snoozeUntilTomorrow(reminder, now));
        }
        return texts.tapDone;
    }

    private async atPosition(position: number): Promise<Reminder | null> {
        const reminders: Reminder[] = await this.domain.listActive(this.userId());
        return reminders[position - 1] ?? null;
    }

    private userId(): string {
        return this.context.get().userId ?? '';
    }
}
