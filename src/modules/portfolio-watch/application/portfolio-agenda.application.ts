import { Injectable } from '@nestjs/common';
import { HolderFilter } from '../../../shared/holder/holder-filter';
import { AGENDA_MAX_DAYS, AgendaItem, AgendaWindow } from '../domain/portfolio-agenda.types';
import { InvalidAgendaWindowError } from '../domain/portfolio-watch.errors';
import { addDaysTo } from '../domain/watch-notice-entries';
import { PortfolioAgendaService } from '../services/portfolio-agenda.service';
import { AgendaResponse } from '../validation/portfolio-watch.schemas';

@Injectable()
export class PortfolioAgendaApplication {
    public constructor(private readonly agenda: PortfolioAgendaService) {}

    public async list(window: AgendaWindow, holder: HolderFilter): Promise<AgendaResponse> {
        if (window.from > window.to || window.to > addDaysTo(window.from, AGENDA_MAX_DAYS)) {
            throw new InvalidAgendaWindowError(window.from, window.to);
        }
        const items: AgendaItem[] = await this.agenda.build(window, holder);
        return { from: window.from, to: window.to, items };
    }
}
