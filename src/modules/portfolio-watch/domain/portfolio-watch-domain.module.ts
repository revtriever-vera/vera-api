import { Module } from '@nestjs/common';
import { PortfolioWatchRepositoryModule } from '../repositories/portfolio-watch-repository.module';
import { PortfolioIncomeLedgerDomain } from './portfolio-income-ledger.domain';
import { PortfolioMonthlySnapshotDomain } from './portfolio-monthly-snapshot.domain';

@Module({
    imports: [PortfolioWatchRepositoryModule],
    providers: [PortfolioMonthlySnapshotDomain, PortfolioIncomeLedgerDomain],
    exports: [PortfolioMonthlySnapshotDomain, PortfolioIncomeLedgerDomain]
})
export class PortfolioWatchDomainModule {}
