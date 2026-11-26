import { Injectable } from '@nestjs/common';
import { PortfolioEventsRepository } from '../repositories/portfolio-events.repository';
import { EventWindow, PortfolioEventView, PortfolioEventWrite } from './portfolio-events.types';

@Injectable()
export class PortfolioEventDomain {
    public constructor(private readonly events: PortfolioEventsRepository) {}

    public async saveMany(events: readonly PortfolioEventWrite[]): Promise<number> {
        const unique: Map<string, PortfolioEventWrite> = new Map<string, PortfolioEventWrite>();
        for (const event of events) {
            unique.set(`${event.source}|${event.externalKey}`, event);
        }
        await this.events.upsertMany([...unique.values()]);
        return unique.size;
    }

    public async findForAssets(assetIds: readonly string[], window: EventWindow): Promise<PortfolioEventView[]> {
        return this.events.findInWindow(assetIds, window);
    }
}
