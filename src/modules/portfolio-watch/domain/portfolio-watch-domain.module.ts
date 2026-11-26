import { Module } from '@nestjs/common';
import { PortfolioWatchRepositoryModule } from '../repositories/portfolio-watch-repository.module';
import { MonthlyReviewDomain } from './monthly-review.domain';
import { PortfolioIncomeLedgerDomain } from './portfolio-income-ledger.domain';
import { PortfolioMonthlySnapshotDomain } from './portfolio-monthly-snapshot.domain';

@Module({
    imports: [PortfolioWatchRepositoryModule],
    providers: [PortfolioMonthlySnapshotDomain, PortfolioIncomeLedgerDomain, MonthlyReviewDomain],
    exports: [PortfolioMonthlySnapshotDomain, PortfolioIncomeLedgerDomain, MonthlyReviewDomain]
})
export class PortfolioWatchDomainModule {}
