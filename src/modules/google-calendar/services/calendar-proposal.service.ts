import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { JsonObject } from '../../../core/llm/llm.types';
import { IdUtil } from '../../../shared/utils/id.util';
import { AppLocale } from '../../../shared/i18n/locale';
import { CalendarEventCreatedDomain } from '../domain/calendar-event-created.domain';
import { CalendarTexts, calendarTextsFor } from '../domain/calendar-texts';
import { CalendarProviderUnavailableError, CalendarReadOnlyError, CalendarNotConnectedError } from '../domain/calendar.errors';
import { CalendarAccess, CreatedCalendarEvent, VERA_SOURCE } from '../domain/calendar.types';
import { googleEventIdOf, startsInFuture } from '../domain/proposal-rules';
import { ProposalPayload, proposalPayloadSchema } from '../validation/calendar-proposal.schemas';
import { CalendarClientService } from './calendar-client.service';
import { CalendarMetricsService } from './calendar-metrics.service';

export interface ProposedMeeting {
    readonly title: string;
    readonly start: Date;
    readonly end: Date;
}

@Injectable()
export class CalendarProposalService {
    public constructor(
        private readonly client: CalendarClientService,
        private readonly created: CalendarEventCreatedDomain,
        private readonly metrics: CalendarMetricsService,
        private readonly context: AppContext
    ) {}

    public payloadOf(userId: string, meeting: ProposedMeeting, timeZone: string): JsonObject {
        return {
            proposalId: IdUtil.newId(),
            userId,
            title: meeting.title,
            start: meeting.start.toISOString(),
            end: meeting.end.toISOString(),
            timeZone
        };
    }

    public parse(payload: JsonObject): ProposalPayload {
        return proposalPayloadSchema.parse(payload);
    }

    public async confirm(payload: JsonObject, locale: AppLocale): Promise<string> {
        const proposal: ProposalPayload = this.parse(payload);
        if (this.context.get().userId !== proposal.userId) {
            throw new Error('the confirmation does not belong to the proposal owner');
        }
        const texts: CalendarTexts = calendarTextsFor(locale);
        if (!startsInFuture(proposal, new Date())) {
            return texts.past;
        }
        try {
            return await this.create(proposal, texts);
        } catch (error: unknown) {
            return this.refusalOf(error, texts);
        }
    }

    private async create(proposal: ProposalPayload, texts: CalendarTexts): Promise<string> {
        const access: CalendarAccess = await this.client.accessOf(proposal.userId);
        if (access === 'read_only') {
            return texts.readOnly;
        }
        const event: CreatedCalendarEvent = await this.client.create(proposal.userId, {
            summary: proposal.title,
            start: new Date(proposal.start),
            end: new Date(proposal.end),
            timeZone: proposal.timeZone,
            source: VERA_SOURCE,
            idempotencyKey: googleEventIdOf(proposal.proposalId)
        });
        if (await this.created.record(proposal.userId, proposal.proposalId, event.eventId)) {
            this.metrics.eventCreated();
        }
        return texts.created(proposal.title, new Date(proposal.start), proposal.timeZone);
    }

    private refusalOf(error: unknown, texts: CalendarTexts): string {
        if (error instanceof CalendarNotConnectedError) {
            return texts.notConnected;
        }
        if (error instanceof CalendarReadOnlyError) {
            return texts.readOnly;
        }
        if (error instanceof CalendarProviderUnavailableError) {
            return texts.unavailable;
        }
        throw error;
    }
}
