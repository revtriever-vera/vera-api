import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { RecurringNoticePrefsRepository } from './recurring-notice-prefs.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [RecurringNoticePrefsRepository],
    exports: [RecurringNoticePrefsRepository]
})
export class RecurringNoticesRepositoryModule {}
