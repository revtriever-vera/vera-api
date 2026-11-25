import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { ANY_HOLDER } from '../../../shared/holder/holder-filter';
import { DateUtil } from '../../../shared/utils/date.util';
import { FixedIncomeCompaniesService } from '../../fixed-income/services/fixed-income-companies.service';
import { PositionReaderService } from '../../positions/services/position-reader.service';
import { PortfolioSnapshot, PortfolioSnapshotService } from '../../portfolio/services/portfolio-snapshot.service';
import { monthOf, monthlySnapshotEntriesOf } from '../domain/monthly-snapshot-entries';
import { PortfolioMonthlySnapshotDomain } from '../domain/portfolio-monthly-snapshot.domain';
import { MonthlySnapshotEntry } from '../domain/portfolio-watch.types';
import { PortfolioWatchLogService } from '../services/portfolio-watch-log.service';
import { PortfolioWatchPublisherService } from '../services/portfolio-watch-publisher.service';

@Injectable()
export class PortfolioWatchSnapshotApplication {
    public constructor(
        private readonly positions: PositionReaderService,
        private readonly titles: FixedIncomeCompaniesService,
        private readonly portfolio: PortfolioSnapshotService,
        private readonly snapshots: PortfolioMonthlySnapshotDomain,
        private readonly publisher: PortfolioWatchPublisherService,
        private readonly logs: PortfolioWatchLogService
    ) {}

    public async fanOutMonthly(now: Date = new Date()): Promise<number> {
        const month: string = monthOf(DateUtil.todayInBrazil(now));
        const companyIds: Set<string> = new Set([
            ...(await this.positions.companyIdsWithRealPositions()),
            ...(await this.titles.companyIdsWithRealTitles())
        ]);
        for (const companyId of companyIds) {
            await this.publisher.requestMonthlySnapshot(companyId, month);
        }
        this.logs.snapshotFanOut(companyIds.size);
        return companyIds.size;
    }

    @AsCompany()
    public async snapshotCompany(_companyId: string, now: Date = new Date()): Promise<number> {
        const month: string = monthOf(DateUtil.todayInBrazil(now));
        const snapshot: PortfolioSnapshot = await this.portfolio.build(ANY_HOLDER);
        const entries: MonthlySnapshotEntry[] = monthlySnapshotEntriesOf(snapshot);
        if (entries.length === 0) {
            return 0;
        }
        await this.snapshots.saveMonth(month, entries);
        this.logs.snapshotSaved(month, entries.length);
        return entries.length;
    }
}
