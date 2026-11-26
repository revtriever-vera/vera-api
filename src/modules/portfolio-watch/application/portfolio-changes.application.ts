import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { ANY_HOLDER } from '../../../shared/holder/holder-filter';
import { DateUtil } from '../../../shared/utils/date.util';
import { NoticeService } from '../../notices/services/notice.service';
import { PlanGateService } from '../../plans/services/plan-gate.service';
import { PositionReaderService } from '../../positions/services/position-reader.service';
import { portfolioWatchConfig } from '../config/portfolio-watch.config';
import { limitedChanges } from '../domain/portfolio-changes';
import { CHANGES_FEATURE, ChangeItem, ChangesFeed, ChangesQuery } from '../domain/portfolio-changes.types';
import { FeatureLockedError } from '../domain/portfolio-watch.errors';
import {
    WEEKLY_CHANGES_DAYS,
    WEEKLY_CHANGES_NOTICE_TYPE,
    isoWeekOf,
    weeklyChangesProps,
    weeklyItemsOf,
    weeklyNoticeKeyOf
} from '../domain/weekly-changes';
import { PortfolioChangesReaderService } from '../services/portfolio-changes-reader.service';
import { PortfolioWatchLogService } from '../services/portfolio-watch-log.service';
import { PortfolioWatchPublisherService } from '../services/portfolio-watch-publisher.service';

type NoticeOutcome = Awaited<ReturnType<NoticeService['notify']>>;

@Injectable()
export class PortfolioChangesApplication {
    public constructor(
        private readonly reader: PortfolioChangesReaderService,
        private readonly gate: PlanGateService,
        private readonly positions: PositionReaderService,
        private readonly notices: NoticeService,
        private readonly publisher: PortfolioWatchPublisherService,
        private readonly logs: PortfolioWatchLogService,
        @Inject(portfolioWatchConfig.KEY) private readonly config: ConfigType<typeof portfolioWatchConfig>
    ) {}

    public async list(query: ChangesQuery): Promise<ChangesFeed> {
        const feed: ChangesFeed = await this.reader.read(query);
        if ((await this.gate.planOf()) === 'free') {
            throw new FeatureLockedError(CHANGES_FEATURE, feed.items.length);
        }
        return { ...feed, items: limitedChanges(feed.items) };
    }

    public async fanOutWeekly(now: Date = new Date()): Promise<number> {
        const week: string = isoWeekOf(DateUtil.todayInBrazil(now));
        const companyIds: readonly string[] = await this.positions.companyIdsWithRealPositions();
        for (const companyId of companyIds) {
            await this.publisher.requestWeekly(companyId, week);
        }
        this.logs.weeklyFanOut(companyIds.length);
        return companyIds.length;
    }

    @AsCompany()
    public async evaluateWeekly(companyId: string, now: Date = new Date()): Promise<number> {
        if ((await this.gate.planOf()) === 'free') {
            return 0;
        }
        const feed: ChangesFeed = await this.reader.read({ days: WEEKLY_CHANGES_DAYS, classId: null, holder: ANY_HOLDER }, now);
        const items: ChangeItem[] = weeklyItemsOf(feed.items);
        if (items.length === 0) {
            return 0;
        }
        const week: string = isoWeekOf(DateUtil.todayInBrazil(now));
        const outcome: NoticeOutcome = await this.notices.notify(companyId, {
            type: WEEKLY_CHANGES_NOTICE_TYPE,
            key: weeklyNoticeKeyOf(week),
            props: weeklyChangesProps(items, this.config.APP_URL)
        });
        this.logs.weeklyEvaluated(items.length, outcome.sent);
        return outcome.sent;
    }
}
