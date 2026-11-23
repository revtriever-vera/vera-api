import { Injectable } from '@nestjs/common';
import { ZodTypeAny } from 'zod';
import { AppContext } from '../../../core/context/app-context.port';
import { AppLocale } from '../../../shared/i18n/locale';
import { AskVeraToolOutput, AskVeraToolPort, PaidFeature } from '../../ai-assistant/services/ask-vera-tool.port';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { CalendarTexts, calendarTextsFor } from '../domain/calendar-texts';
import { CalendarNotConnectedError, CalendarProviderUnavailableError } from '../domain/calendar.errors';
import { CalendarAccess, CalendarEvent, CalendarRange, UPCOMING_DAYS, UPCOMING_MAX } from '../domain/calendar.types';
import { parseWallClock } from '../domain/local-time';
import { ProposalEvaluation, evaluateProposal } from '../domain/proposal-rules';
import { createToolInputSchema, listToolInputSchema } from '../validation/calendar.schemas';
import { CalendarClientService } from './calendar-client.service';
import { CalendarProposalService } from './calendar-proposal.service';

type ToolKind = AskVeraToolPort['kind'];

const FEATURE: PaidFeature = 'calendar';
const DAY_MS: number = 86_400_000;
const MAX_WINDOW_DAYS: number = 31;

interface ListInput {
    readonly from?: string;
    readonly to?: string;
}

interface CreateInput {
    readonly title: string;
    readonly start?: string;
    readonly durationMinutes?: number;
}

function rangeOf(input: ListInput, timeZone: string, now: Date): CalendarRange {
    const parsedFrom: Date | null = input.from === undefined ? null : parseWallClock(input.from, timeZone);
    const from: Date = parsedFrom ?? now;
    const parsedTo: Date | null = input.to === undefined ? null : parseWallClock(input.to, timeZone);
    const limit: number = from.getTime() + MAX_WINDOW_DAYS * DAY_MS;
    const to: Date =
        parsedTo !== null && parsedTo > from
            ? new Date(Math.min(parsedTo.getTime(), limit))
            : new Date(from.getTime() + UPCOMING_DAYS * DAY_MS);
    return { from, to, max: UPCOMING_MAX };
}

@Injectable()
export class CalendarListEventsTool extends AskVeraToolPort {
    public readonly name: string = 'calendar_list_events';
    public readonly feature: PaidFeature = FEATURE;
    public readonly kind: ToolKind = 'direct';
    public readonly inputSchema: ZodTypeAny = listToolInputSchema;

    public constructor(
        private readonly client: CalendarClientService,
        private readonly timezones: CompanyTimezoneService,
        private readonly context: AppContext
    ) {
        super();
    }

    public description(locale: AppLocale): string {
        return locale === 'pt-BR'
            ? 'Mostra à pessoa os próximos compromissos da agenda dela. Use quando ela pedir para ver reuniões ou compromissos. Os títulos não voltam para você: a lista sai pronta.'
            : 'Shows the person their upcoming calendar events. Use when they ask to see meetings or appointments. Titles do not come back to you: the list is sent ready.';
    }

    public async run(input: unknown): Promise<AskVeraToolOutput> {
        const texts: CalendarTexts = calendarTextsFor(this.context.get().locale);
        const timeZone: string = await this.timezones.timezoneOfCompany();
        try {
            const events: CalendarEvent[] = await this.client.upcoming(
                this.context.get().userId ?? '',
                rangeOf(input as ListInput, timeZone, new Date())
            );
            return { payload: {}, text: this.textOf(events, texts, timeZone) };
        } catch (error: unknown) {
            if (error instanceof CalendarNotConnectedError) {
                return { payload: {}, text: texts.notConnected };
            }
            if (error instanceof CalendarProviderUnavailableError) {
                return { payload: {}, text: texts.unavailable };
            }
            throw error;
        }
    }

    private textOf(events: readonly CalendarEvent[], texts: CalendarTexts, timeZone: string): string {
        if (events.length === 0) {
            return texts.noEvents;
        }
        const lines: string[] = events.map((event: CalendarEvent): string =>
            texts.eventLine({ title: event.title, start: new Date(event.start), allDay: event.allDay }, timeZone)
        );
        return [texts.eventsHeader, ...lines].join('\n');
    }
}

@Injectable()
export class CalendarCreateEventTool extends AskVeraToolPort {
    public readonly name: string = 'calendar_create_event';
    public readonly feature: PaidFeature = FEATURE;
    public readonly kind: ToolKind = 'proposal';
    public readonly inputSchema: ZodTypeAny = createToolInputSchema;

    public constructor(
        private readonly client: CalendarClientService,
        private readonly proposals: CalendarProposalService,
        private readonly timezones: CompanyTimezoneService,
        private readonly context: AppContext
    ) {
        super();
    }

    public description(locale: AppLocale): string {
        return locale === 'pt-BR'
            ? 'Propõe uma reunião no Google Agenda da pessoa. O título vem da mensagem dela. Resolva datas como "sexta às 15h" com a data de hoje e o fuso, e passe start local (2026-11-27T15:00). Sem dia e horário, omita start. Duração padrão 60 minutos. A pessoa confirma antes.'
            : 'Proposes a meeting in the person Google Calendar. The title comes from their message. Resolve dates like "Friday at 3pm" with today date and the time zone, and pass a local start (2026-11-27T15:00). Without day and time, omit start. Default duration 60 minutes. The person confirms first.';
    }

    public async run(input: unknown): Promise<AskVeraToolOutput> {
        const texts: CalendarTexts = calendarTextsFor(this.context.get().locale);
        const userId: string = this.context.get().userId ?? '';
        const blocked: AskVeraToolOutput | null = await this.blockedOutput(userId, texts);
        if (blocked !== null) {
            return blocked;
        }
        const timeZone: string = await this.timezones.timezoneOfCompany();
        const evaluation: ProposalEvaluation = evaluateProposal(this.draftOf(input as CreateInput), timeZone, new Date());
        if (evaluation.status !== 'proposed') {
            return this.unresolvedOutput(evaluation, texts);
        }
        return {
            payload: { status: 'proposed' },
            proposal: {
                summary: texts.summaryCreate(evaluation.title, evaluation.start, timeZone),
                payload: this.proposals.payloadOf(userId, evaluation, timeZone)
            }
        };
    }

    private unresolvedOutput(evaluation: Exclude<ProposalEvaluation, { status: 'proposed' }>, texts: CalendarTexts): AskVeraToolOutput {
        if (evaluation.status === 'needs_time') {
            return { payload: { status: 'needs_time', say: texts.needsTime } };
        }
        return { payload: { status: 'invalid', reason: evaluation.reason, ...(evaluation.reason === 'past' ? { say: texts.past } : {}) } };
    }

    private draftOf(input: CreateInput): Parameters<typeof evaluateProposal>[0] {
        return { title: input.title, start: input.start, durationMinutes: input.durationMinutes };
    }

    private async blockedOutput(userId: string, texts: CalendarTexts): Promise<AskVeraToolOutput | null> {
        try {
            const access: CalendarAccess = await this.client.accessOf(userId);
            return access === 'read_only' ? { payload: { status: 'read_only', say: texts.readOnly } } : null;
        } catch (error: unknown) {
            if (error instanceof CalendarNotConnectedError) {
                return { payload: { status: 'not_connected', say: texts.notConnected } };
            }
            throw error;
        }
    }
}
