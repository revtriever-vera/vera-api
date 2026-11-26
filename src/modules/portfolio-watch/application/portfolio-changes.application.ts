import { Injectable } from '@nestjs/common';
import { PlanGateService } from '../../plans/services/plan-gate.service';
import { limitedChanges } from '../domain/portfolio-changes';
import { CHANGES_FEATURE, ChangesFeed, ChangesQuery } from '../domain/portfolio-changes.types';
import { FeatureLockedError } from '../domain/portfolio-watch.errors';
import { PortfolioChangesReaderService } from '../services/portfolio-changes-reader.service';

@Injectable()
export class PortfolioChangesApplication {
    public constructor(
        private readonly reader: PortfolioChangesReaderService,
        private readonly gate: PlanGateService
    ) {}

    public async list(query: ChangesQuery): Promise<ChangesFeed> {
        const feed: ChangesFeed = await this.reader.read(query);
        if ((await this.gate.planOf()) === 'free') {
            throw new FeatureLockedError(CHANGES_FEATURE, feed.items.length);
        }
        return { ...feed, items: limitedChanges(feed.items) };
    }
}
