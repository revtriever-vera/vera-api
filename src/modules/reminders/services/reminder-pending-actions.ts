import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { JsonObject } from '../../../core/llm/llm.types';
import { AppLocale } from '../../../shared/i18n/locale';
import { LinkContactService } from '../../whatsapp-link/services/link-contact.service';
import { PendingActionExecutorPort } from '../../whatsapp-chat/services/pending-action-executor.port';
import { ReminderDomain } from '../domain/reminder.domain';
import { ReminderTexts, reminderTextsFor, whenOf } from '../domain/reminder-texts';
import { ReminderLimitReachedError } from '../domain/reminders.errors';
import { CANCEL_REASONS, NewReminderInput, Reminder } from '../domain/reminders.types';
import { CreatePayload, DeletePayload, createPayloadSchema, deletePayloadSchema } from '../validation/reminders.schemas';
import { ReminderEngineService } from './reminder-engine.service';

function whenOfPayload(payload: CreatePayload, locale: AppLocale): string {
    return whenOf(
        {
            kind: payload.kind,
            onceAt: payload.onceAt === null ? null : new Date(payload.onceAt),
            dayOfMonth: payload.dayOfMonth,
            timeOfDay: payload.timeOfDay,
            timezone: payload.timezone
        },
        locale
    );
}

type ExecutorKind = PendingActionExecutorPort['kind'];

@Injectable()
export class ReminderCreateExecutor extends PendingActionExecutorPort {
    public readonly kind: ExecutorKind = 'reminder_create';

    public constructor(
        private readonly engine: ReminderEngineService,
        private readonly links: LinkContactService,
        private readonly context: AppContext
    ) {
        super();
    }

    public async execute(payload: JsonObject): Promise<string | null> {
        const parsed: CreatePayload = createPayloadSchema.parse(payload);
        const locale: AppLocale = this.context.get().locale;
        const userId: string = this.context.get().userId ?? '';
        const linkId: string | null = await this.links.liveLinkIdOfUser(userId);
        if (linkId === null) {
            throw new Error('no live whatsapp link for the person');
        }
        try {
            await this.engine.create(this.inputOf(parsed, userId, linkId));
        } catch (error: unknown) {
            if (error instanceof ReminderLimitReachedError) {
                return reminderTextsFor(locale).limitReached(this.engine.maxActive());
            }
            throw error;
        }
        return reminderTextsFor(locale).created(parsed.text, whenOfPayload(parsed, locale));
    }

    public describe(payload: JsonObject, locale: AppLocale): string {
        const parsed: CreatePayload = createPayloadSchema.parse(payload);
        return reminderTextsFor(locale).summaryCreate(parsed.text, whenOfPayload(parsed, locale));
    }

    private inputOf(parsed: CreatePayload, userId: string, linkId: string): NewReminderInput {
        return {
            userId,
            linkId,
            text: parsed.text,
            kind: parsed.kind,
            onceAt: parsed.onceAt === null ? null : new Date(parsed.onceAt),
            dayOfMonth: parsed.dayOfMonth,
            timeOfDay: parsed.timeOfDay,
            timezone: parsed.timezone
        };
    }
}

@Injectable()
export class ReminderDeleteExecutor extends PendingActionExecutorPort {
    public readonly kind: ExecutorKind = 'reminder_delete';

    public constructor(
        private readonly domain: ReminderDomain,
        private readonly engine: ReminderEngineService,
        private readonly context: AppContext
    ) {
        super();
    }

    public async execute(payload: JsonObject): Promise<string | null> {
        const parsed: DeletePayload = deletePayloadSchema.parse(payload);
        const texts: ReminderTexts = reminderTextsFor(this.context.get().locale);
        const reminder: Reminder | null = await this.domain.activeOfUser(parsed.reminderId, this.context.get().userId ?? '');
        if (reminder === null) {
            return texts.tapGone;
        }
        await this.engine.cancel({ id: reminder.id }, CANCEL_REASONS.user);
        return texts.deleted(reminder.text);
    }

    public describe(payload: JsonObject, locale: AppLocale): string {
        return reminderTextsFor(locale).summaryDelete(deletePayloadSchema.parse(payload).text);
    }
}
