import { Module } from '@nestjs/common';
import { RecurringRepositoryModule } from '../repositories/recurring-repository.module';
import { RecurringAlertsDomain } from './recurring-alerts.domain';
import { RecurringSeriesDomain } from './recurring-series.domain';

@Module({
    imports: [RecurringRepositoryModule],
    providers: [RecurringSeriesDomain, RecurringAlertsDomain],
    exports: [RecurringSeriesDomain, RecurringAlertsDomain]
})
export class RecurringDomainModule {}
