import { Injectable } from '@nestjs/common';
import { ZodTypeAny } from 'zod';
import { AppContext } from '../../../core/context/app-context.port';
import { JsonObject } from '../../../core/llm/llm.types';
import { AppLocale } from '../../../shared/i18n/locale';
import { AskVeraToolOutput, AskVeraToolPort, PaidFeature } from '../../ai-assistant/services/ask-vera-tool.port';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { ReminderDomain } from '../domain/reminder.domain';
import { ReminderRequest, ResolvedReminder, resolveReminder } from '../domain/reminder-request';
import { ReminderTexts, reminderTextsFor, whenOf } from '../domain/reminder-texts';
import { ReminderInvalidScheduleError } from '../domain/reminders.errors';
import { Reminder } from '../domain/reminders.types';
import { noReminderInputSchema, reminderCancelInputSchema, reminderCreateInputSchema } from '../validation/reminders.schemas';
import { ReminderCommandsService } from './reminder-commands.service';
import { ReminderEngineService } from './reminder-engine.service';

type ToolKind = AskVeraToolPort['kind'];

const FEATURE: PaidFeature = 'whatsapp';

@Injectable()
export class ReminderCreateTool extends AskVeraToolPort {
    public readonly name: string = 'reminder_create';
    public readonly feature: PaidFeature = FEATURE;
    public readonly kind: ToolKind = 'proposal';
    public readonly inputSchema: ZodTypeAny = reminderCreateInputSchema;

    public constructor(
        private readonly engine: ReminderEngineService,
        private readonly timezones: CompanyTimezoneService,
        private readonly context: AppContext
    ) {
        super();
    }

    public description(locale: AppLocale): string {
        return locale === 'pt-BR'
            ? 'Propõe um lembrete que a Vera envia no WhatsApp: único (kind once, com at) ou todo mês (kind monthly, com dayOfMonth). Hora padrão 09:00. O texto vem da mensagem da pessoa, sem links. A pessoa confirma antes.'
            : 'Proposes a reminder Vera sends on WhatsApp: one time (kind once, with at) or every month (kind monthly, with dayOfMonth). Default time 09:00. The text comes from the person message, without links. The person confirms first.';
    }

    public async run(input: unknown): Promise<AskVeraToolOutput> {
        const locale: AppLocale = this.context.get().locale;
        const texts: ReminderTexts = reminderTextsFor(locale);
        if (!(await this.engine.hasRoom(this.context.get().userId ?? ''))) {
            const limit: number = this.engine.maxActive();
            return { payload: { status: 'refused', reason: 'limit_reached', say: texts.limitReached(limit) }, numbers: [limit] };
        }
        try {
            const resolved: ResolvedReminder = resolveReminder(
                input as ReminderRequest,
                await this.timezones.timezoneOfCompany(),
                new Date()
            );
            return {
                payload: { status: 'proposed' },
                proposal: { summary: texts.summaryCreate(resolved.text, whenOf(resolved, locale)), payload: this.payloadOf(resolved) }
            };
        } catch (error: unknown) {
            if (error instanceof ReminderInvalidScheduleError) {
                return { payload: { status: 'invalid', field: String(error.meta?.['reason'] ?? 'at') } };
            }
            throw error;
        }
    }

    private payloadOf(resolved: ResolvedReminder): JsonObject {
        return {
            text: resolved.text,
            kind: resolved.kind,
            onceAt: resolved.onceAt?.toISOString() ?? null,
            dayOfMonth: resolved.dayOfMonth,
            timeOfDay: resolved.timeOfDay,
            timezone: resolved.timezone
        };
    }
}

@Injectable()
export class ReminderListTool extends AskVeraToolPort {
    public readonly name: string = 'reminder_list';
    public readonly feature: PaidFeature = FEATURE;
    public readonly kind: ToolKind = 'direct';
    public readonly inputSchema: ZodTypeAny = noReminderInputSchema;

    public constructor(
        private readonly commands: ReminderCommandsService,
        private readonly context: AppContext
    ) {
        super();
    }

    public description(locale: AppLocale): string {
        return locale === 'pt-BR'
            ? 'Mostra à pessoa a lista numerada dos lembretes dela. Use quando ela pedir para ver os lembretes.'
            : 'Shows the person the numbered list of their reminders. Use when they ask to see their reminders.';
    }

    public async run(): Promise<AskVeraToolOutput> {
        return { payload: {}, text: await this.commands.list(this.context.get().locale) };
    }
}

@Injectable()
export class ReminderCancelTool extends AskVeraToolPort {
    public readonly name: string = 'reminder_cancel';
    public readonly feature: PaidFeature = FEATURE;
    public readonly kind: ToolKind = 'proposal';
    public readonly inputSchema: ZodTypeAny = reminderCancelInputSchema;

    public constructor(
        private readonly domain: ReminderDomain,
        private readonly context: AppContext
    ) {
        super();
    }

    public description(locale: AppLocale): string {
        return locale === 'pt-BR'
            ? 'Propõe apagar um lembrete pela posição dele na lista numerada (reminder_list). A pessoa confirma antes.'
            : 'Proposes deleting a reminder by its position in the numbered list (reminder_list). The person confirms first.';
    }

    public async run(input: unknown): Promise<AskVeraToolOutput> {
        const position: number = (input as { position: number }).position;
        const reminders: Reminder[] = await this.domain.listActive(this.context.get().userId ?? '');
        const reminder: Reminder | undefined = reminders[position - 1];
        if (reminder === undefined) {
            return { payload: { status: 'not_found', position }, numbers: [position] };
        }
        const texts: ReminderTexts = reminderTextsFor(this.context.get().locale);
        return {
            payload: { status: 'proposed' },
            proposal: { summary: texts.summaryDelete(reminder.text), payload: { reminderId: reminder.id, text: reminder.text } }
        };
    }
}
