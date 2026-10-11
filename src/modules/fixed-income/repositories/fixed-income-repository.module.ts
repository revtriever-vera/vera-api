import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { FixedIncomeTitlesRepository } from './fixed-income-titles.repository';
import { IndexSeriesPointsRepository } from './index-series-points.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [FixedIncomeTitlesRepository, IndexSeriesPointsRepository],
    exports: [FixedIncomeTitlesRepository, IndexSeriesPointsRepository]
})
export class FixedIncomeRepositoryModule {}
