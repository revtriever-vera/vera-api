import { Module } from '@nestjs/common';
import { FixedIncomeApplicationModule } from '../../application/fixed-income-application.module';
import { FixedIncomeServicesModule } from '../../services/fixed-income-services.module';
import { IndexSyncCommand } from '../commands/index-sync.command';
import { IndexSyncSeriesHandler } from './index-sync-series.handler';
import { IndexSyncTickHandler } from './index-sync-tick.handler';

@Module({
    imports: [FixedIncomeApplicationModule, FixedIncomeServicesModule],
    providers: [IndexSyncCommand, IndexSyncTickHandler, IndexSyncSeriesHandler]
})
export class FixedIncomeQueueModule {}
