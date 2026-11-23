import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { JsonObject } from '../../../core/llm/llm.types';
import { AppLocale } from '../../../shared/i18n/locale';
import { PendingActionExecutorPort } from '../../whatsapp-chat/services/pending-action-executor.port';
import { calendarTextsFor } from '../domain/calendar-texts';
import type { ProposalPayload } from '../validation/calendar-proposal.schemas';
import { CalendarProposalService } from './calendar-proposal.service';

@Injectable()
export class CalendarCreateExecutor extends PendingActionExecutorPort {
    public readonly kind: PendingActionExecutorPort['kind'] = 'calendar_create';

    public constructor(
        private readonly proposals: CalendarProposalService,
        private readonly context: AppContext
    ) {
        super();
    }

    public async execute(payload: JsonObject): Promise<string | null> {
        return this.proposals.confirm(payload, this.context.get().locale);
    }

    public describe(payload: JsonObject, locale: AppLocale): string {
        const proposal: ProposalPayload = this.proposals.parse(payload);
        return calendarTextsFor(locale).summaryCreate(proposal.title, new Date(proposal.start), proposal.timeZone);
    }

    public override canceledText(locale: AppLocale): string {
        return calendarTextsFor(locale).canceled;
    }
}
