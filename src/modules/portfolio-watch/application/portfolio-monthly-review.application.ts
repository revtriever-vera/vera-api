import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { DateUtil } from '../../../shared/utils/date.util';
import { FixedIncomeCompaniesService } from '../../fixed-income/services/fixed-income-companies.service';
import { PositionReaderService } from '../../positions/services/position-reader.service';
import { MonthlyReviewDomain } from '../domain/monthly-review.domain';
import { MonthlyReviewRow } from '../domain/monthly-review.types';
import { monthOf } from '../domain/monthly-snapshot-entries';
import { MonthlyReviewNotFoundError } from '../domain/portfolio-watch.errors';
import { monthBefore } from '../domain/review-months';
import { MonthlyReviewService } from '../services/monthly-review.service';
import { PortfolioWatchLogService } from '../services/portfolio-watch-log.service';
import { PortfolioWatchPublisherService } from '../services/portfolio-watch-publisher.service';
import { MonthlyReview, MonthlyReviewList, monthlyReviewSchema } from '../validation/monthly-review.schemas';

@Injectable()
export class PortfolioMonthlyReviewApplication {
    public constructor(
        private readonly positions: PositionReaderService,
        private readonly titles: FixedIncomeCompaniesService,
        private readonly reviews: MonthlyReviewService,
        private readonly stored: MonthlyReviewDomain,
        private readonly publisher: PortfolioWatchPublisherService,
        private readonly logs: PortfolioWatchLogService
    ) {}

    public async fanOutMonthly(now: Date = new Date()): Promise<number> {
        const month: string = monthBefore(monthOf(DateUtil.todayInBrazil(now)));
        const companyIds: Set<string> = new Set([
            ...(await this.positions.companyIdsWithRealPositions()),
            ...(await this.titles.companyIdsWithRealTitles())
        ]);
        for (const companyId of companyIds) {
            await this.publisher.requestMonthlyReview(companyId, month);
        }
        this.logs.reviewFanOut(companyIds.size);
        return companyIds.size;
    }

    @AsCompany()
    public async reviewCompany(companyId: string, month: string): Promise<boolean> {
        const review: MonthlyReview | null = await this.reviews.build(companyId, month);
        if (review === null) {
            return false;
        }
        const recorded: boolean = await this.stored.record(month, review);
        this.logs.reviewSaved(month, recorded);
        return recorded;
    }

    public async get(month: string): Promise<MonthlyReview> {
        const row: MonthlyReviewRow | null = await this.stored.find(month);
        if (row === null) {
            throw new MonthlyReviewNotFoundError(month);
        }
        return monthlyReviewSchema.parse(row.payload);
    }

    public async list(): Promise<MonthlyReviewList> {
        const rows: MonthlyReviewRow[] = await this.stored.listRecent();
        return {
            items: rows.map((row: MonthlyReviewRow): MonthlyReviewList['items'][number] => ({
                month: row.month,
                returnPct: monthlyReviewSchema.parse(row.payload).returnPct ?? null
            }))
        };
    }
}
