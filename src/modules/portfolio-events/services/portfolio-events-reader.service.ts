import { Injectable } from '@nestjs/common';
import { PortfolioEventDomain } from '../domain/portfolio-event.domain';
import { EventWindow, PortfolioEventView } from '../domain/portfolio-events.types';

export type { EventWindow, PortfolioEventView };

@Injectable()
export class PortfolioEventsReaderService {
    public constructor(private readonly events: PortfolioEventDomain) {}

    public async forAssets(assetIds: readonly string[], window: EventWindow): Promise<PortfolioEventView[]> {
        return this.events.findForAssets(assetIds, window);
    }
}
