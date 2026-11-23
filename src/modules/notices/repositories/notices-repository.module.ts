import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { NoticePreferencesRepository } from './notice-preferences.repository';
import { NoticeSendsRepository } from './notice-sends.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [NoticePreferencesRepository, NoticeSendsRepository],
    exports: [NoticePreferencesRepository, NoticeSendsRepository]
})
export class NoticesRepositoryModule {}
