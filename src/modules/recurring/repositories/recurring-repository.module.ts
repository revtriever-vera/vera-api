import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { RecurringChargesRepository } from './recurring-charges.repository';
import { RecurringSeriesRepository } from './recurring-series.repository';
import { RecurringSuppressionsRepository } from './recurring-suppressions.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [RecurringSeriesRepository, RecurringChargesRepository, RecurringSuppressionsRepository],
    exports: [RecurringSeriesRepository, RecurringChargesRepository, RecurringSuppressionsRepository]
})
export class RecurringRepositoryModule {}
