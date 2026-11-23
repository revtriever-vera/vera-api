import { Module } from '@nestjs/common';
import { RecurringNoticesRepositoryModule } from '../repositories/recurring-notices-repository.module';
import { RecurringNoticePrefDomain } from './recurring-notice-pref.domain';

@Module({
    imports: [RecurringNoticesRepositoryModule],
    providers: [RecurringNoticePrefDomain],
    exports: [RecurringNoticePrefDomain]
})
export class RecurringNoticesDomainModule {}
