import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { PaidSendMeter } from '../../../core/usage/services/paid-send-meter.service';
import { PaidUsageMeter } from '../../../core/usage/services/paid-usage-meter.service';
import { CapReachedError } from '../../../core/usage/usage.errors';
import { AppLocale } from '../../../shared/i18n/locale';
import { AppError } from '../../../shared/errors/app.error';
import { REMINDER_TEMPLATE_KEY, TemplateLanguage, WhatsAppOutboundService } from '../../whatsapp/services/whatsapp-outbound.service';
import { WhatsAppWindowService } from '../../whatsapp/services/whatsapp-window.service';
import { LinkContact } from '../../whatsapp-link/services/link-contact.service';
import { remindersConfig } from '../config/reminders.config';
import { ReminderDomain } from '../domain/reminder.domain';
import { reminderTextsFor, ReminderTexts } from '../domain/reminder-texts';
import {
    ButtonAction,
    CHANNELS,
    DeliveryChannel,
    MISS_REASONS,
    MissReason,
    Reminder,
    ReminderOccurrence,
    UNREACHED_REASONS,
    UnreachedReason,
    reminderButtonIdOf
} from '../domain/reminders.types';
import { LocalParts, localPartsIn, zonedTimeToUtc } from '../domain/schedule';

export type DeliveryOutcome =
    | { readonly kind: 'sent'; readonly channel: DeliveryChannel; readonly messageId: string }
    | { readonly kind: 'missed'; readonly reason: MissReason }
    | { readonly kind: 'unreached'; readonly reason: UnreachedReason };

const SEND_TASK: string = 'reminder';
const WINDOW_CLOSED_CODE: string = 'whatsapp.window_closed';
const TEMPLATE_UNAVAILABLE_CODE: string = 'whatsapp.template_unavailable';
const PROVIDER_DISABLED_CODE: string = 'whatsapp.provider_disabled';
const PRICE_UNAVAILABLE_CODE: string = 'usage.price_unavailable';
const MONTH_START_DAY: number = 1;

function languageOf(locale: AppLocale): TemplateLanguage {
    return locale === 'pt-BR' ? 'pt_BR' : 'en';
}

@Injectable()
export class ReminderDeliveryService {
    public constructor(
        private readonly domain: ReminderDomain,
        private readonly outbound: WhatsAppOutboundService,
        private readonly window: WhatsAppWindowService,
        private readonly sendMeter: PaidSendMeter,
        private readonly usage: PaidUsageMeter,
        @Inject(remindersConfig.KEY) private readonly config: ConfigType<typeof remindersConfig>
    ) {}

    public async deliver(reminder: Reminder, occurrence: ReminderOccurrence, contact: LinkContact, now: Date): Promise<DeliveryOutcome> {
        if (await this.window.isOpen(contact.peer, now)) {
            const text: DeliveryOutcome | null = await this.deliverText(reminder, contact);
            if (text !== null) {
                return text;
            }
        }
        return this.deliverTemplate(reminder, occurrence, contact, now);
    }

    public async deliverTemplate(
        reminder: Reminder,
        occurrence: ReminderOccurrence,
        contact: LinkContact,
        now: Date
    ): Promise<DeliveryOutcome> {
        if (await this.templateLimitReached(reminder, now)) {
            return { kind: 'missed', reason: MISS_REASONS.templateLimit };
        }
        try {
            await this.usage.assertRoom({ feature: 'whatsapp', task: SEND_TASK, estimateMicros: await this.sendMeter.estimate('utility') });
            const messageId: string = await this.outbound.enqueueTemplate(
                contact.peer,
                REMINDER_TEMPLATE_KEY,
                languageOf(contact.locale),
                [reminder.text],
                this.payloadsOf(reminder)
            );
            await this.sendMeter.record({ kind: 'whatsapp_template', category: 'utility', task: SEND_TASK, referenceId: occurrence.id });
            return { kind: 'sent', channel: CHANNELS.template, messageId };
        } catch (error: unknown) {
            return this.refusalOf(error);
        }
    }

    private async deliverText(reminder: Reminder, contact: LinkContact): Promise<DeliveryOutcome | null> {
        const texts: ReminderTexts = reminderTextsFor(contact.locale);
        try {
            const messageId: string = await this.outbound.enqueueInteractive(contact.peer, {
                body: texts.fire(reminder.text),
                choices: [
                    { id: reminderButtonIdOf('done', reminder.id), title: texts.buttons.done },
                    { id: reminderButtonIdOf('snooze1h', reminder.id), title: texts.buttons.snooze1h },
                    { id: reminderButtonIdOf('tomorrow', reminder.id), title: texts.buttons.tomorrow }
                ]
            });
            return { kind: 'sent', channel: CHANNELS.text, messageId };
        } catch (error: unknown) {
            if (this.codeOf(error) === WINDOW_CLOSED_CODE) {
                return null;
            }
            return this.refusalOf(error);
        }
    }

    private async templateLimitReached(reminder: Reminder, now: Date): Promise<boolean> {
        const today: LocalParts = localPartsIn(reminder.timezone, now);
        const from: Date = zonedTimeToUtc(reminder.timezone, {
            year: today.year,
            month: today.month,
            day: MONTH_START_DAY,
            hour: 0,
            minute: 0
        });
        const nextYear: number = today.month === 12 ? today.year + 1 : today.year;
        const nextMonth: number = today.month === 12 ? 1 : today.month + 1;
        const before: Date = zonedTimeToUtc(reminder.timezone, {
            year: nextYear,
            month: nextMonth,
            day: MONTH_START_DAY,
            hour: 0,
            minute: 0
        });
        return (await this.domain.templateSendsBetween(from, before)) >= this.config.REMINDERS_MAX_TEMPLATE_SENDS_MONTH;
    }

    private payloadsOf(reminder: Reminder): string[] {
        const actions: readonly ButtonAction[] = ['done', 'snooze1h', 'tomorrow'];
        return actions.map((action: ButtonAction): string => reminderButtonIdOf(action, reminder.id));
    }

    private refusalOf(error: unknown): DeliveryOutcome {
        if (error instanceof CapReachedError) {
            return { kind: 'missed', reason: MISS_REASONS.paused };
        }
        const code: string | null = this.codeOf(error);
        if (code === TEMPLATE_UNAVAILABLE_CODE) {
            return { kind: 'unreached', reason: UNREACHED_REASONS.templateUnavailable };
        }
        if (code === PROVIDER_DISABLED_CODE) {
            return { kind: 'unreached', reason: UNREACHED_REASONS.providerDisabled };
        }
        if (code === PRICE_UNAVAILABLE_CODE) {
            return { kind: 'unreached', reason: UNREACHED_REASONS.sendFailed };
        }
        throw error;
    }

    private codeOf(error: unknown): string | null {
        return error instanceof AppError ? error.code : null;
    }
}
