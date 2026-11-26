import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { MonthlyReviewsRepository } from './monthly-reviews.repository';
import { PortfolioIncomeLedgerRepository } from './portfolio-income-ledger.repository';
import { PortfolioMonthlySnapshotsRepository } from './portfolio-monthly-snapshots.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [PortfolioMonthlySnapshotsRepository, PortfolioIncomeLedgerRepository, MonthlyReviewsRepository],
    exports: [PortfolioMonthlySnapshotsRepository, PortfolioIncomeLedgerRepository, MonthlyReviewsRepository]
})
export class PortfolioWatchRepositoryModule {}
