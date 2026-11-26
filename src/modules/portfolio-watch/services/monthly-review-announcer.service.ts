import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { NoticeService } from '../../notices/services/notice.service';
import { PlanGateService } from '../../plans/services/plan-gate.service';
import { portfolioWatchConfig } from '../config/portfolio-watch.config';
import { MONTHLY_REVIEW_NOTICE_TYPE, monthlyReviewNoticeKeyOf, monthlyReviewProps } from '../domain/monthly-review-notice';
import { MonthlyReview } from '../validation/monthly-review.schemas';
import { MonthlyReviewNarrativeService } from './monthly-review-narrative.service';
import { PortfolioWatchLogService } from './portfolio-watch-log.service';

@Injectable()
export class MonthlyReviewAnnouncerService {
    public constructor(
        private readonly gate: PlanGateService,
        private readonly narrative: MonthlyReviewNarrativeService,
        private readonly notices: NoticeService,
        private readonly logs: PortfolioWatchLogService,
        @Inject(portfolioWatchConfig.KEY) private readonly config: ConfigType<typeof portfolioWatchConfig>
    ) {}

    public async announce(companyId: string, review: MonthlyReview): Promise<number> {
        if ((await this.gate.planOf()) === 'free') {
            return 0;
        }
        const paragraphs: readonly string[] | null = await this.narrative.paragraphsOf(review);
        const outcome: Awaited<ReturnType<NoticeService['notify']>> = await this.notices.notify(companyId, {
            type: MONTHLY_REVIEW_NOTICE_TYPE,
            key: monthlyReviewNoticeKeyOf(review.month),
            props: monthlyReviewProps(review, paragraphs, this.config.APP_URL)
        });
        this.logs.reviewAnnounced(paragraphs !== null, outcome.sent);
        return outcome.sent;
    }
}
