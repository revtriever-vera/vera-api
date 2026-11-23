import { Module } from '@nestjs/common';
import { RecurringRepositoryModule } from '../repositories/recurring-repository.module';
import { RecurringSeriesDomain } from './recurring-series.domain';

@Module({
    imports: [RecurringRepositoryModule],
    providers: [RecurringSeriesDomain],
    exports: [RecurringSeriesDomain]
})
export class RecurringDomainModule {}
