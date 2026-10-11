import { Module } from '@nestjs/common';
import { SpendingSummaryRepositoryModule } from '../repositories/spending-summary-repository.module';
import { SpendingSettingsDomain } from './spending-settings.domain';

@Module({
    imports: [SpendingSummaryRepositoryModule],
    providers: [SpendingSettingsDomain],
    exports: [SpendingSettingsDomain]
})
export class SpendingSummaryDomainModule {}
