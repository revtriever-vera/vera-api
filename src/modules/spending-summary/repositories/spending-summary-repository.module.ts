import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { SpendingSettingsRepository } from './spending-settings.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [SpendingSettingsRepository],
    exports: [SpendingSettingsRepository]
})
export class SpendingSummaryRepositoryModule {}
