import { Injectable } from '@nestjs/common';
import { MonthlyReviewSourcePort, MonthlyReviewSourceView } from '../../ai-assistant/services/monthly-review-source.port';
import { MonthlyReviewDomain } from '../domain/monthly-review.domain';
import { MonthlyReviewRow } from '../domain/monthly-review.types';
import { monthlyReviewSchema } from '../validation/monthly-review.schemas';
import { MonthlyReviewNarrativeService } from './monthly-review-narrative.service';

@Injectable()
export class MonthlyReviewSourceService extends MonthlyReviewSourcePort {
    public constructor(
        private readonly stored: MonthlyReviewDomain,
        private readonly narrative: MonthlyReviewNarrativeService
    ) {
        super();
    }

    public async of(month: string): Promise<MonthlyReviewSourceView | null> {
        const row: MonthlyReviewRow | null = await this.stored.find(month);
        return row === null ? null : { review: monthlyReviewSchema.parse(row.payload), labels: await this.narrative.labels() };
    }
}
