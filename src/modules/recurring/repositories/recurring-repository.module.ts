import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { RecurringAlertsRepository } from './recurring-alerts.repository';
import { RecurringChargesRepository } from './recurring-charges.repository';
import { RecurringSeriesRepository } from './recurring-series.repository';
import { RecurringSuppressionsRepository } from './recurring-suppressions.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [RecurringAlertsRepository, RecurringSeriesRepository, RecurringChargesRepository, RecurringSuppressionsRepository],
    exports: [RecurringAlertsRepository, RecurringSeriesRepository, RecurringChargesRepository, RecurringSuppressionsRepository]
})
export class RecurringRepositoryModule {}
