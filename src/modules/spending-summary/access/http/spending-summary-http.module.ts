import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { SpendingSummaryApplicationModule } from '../../application/spending-summary-application.module';
import { SettingsController } from './settings.controller';
import { SummaryController } from './summary.controller';

@Module({
    imports: [SpendingSummaryApplicationModule, IdentityApplicationModule, ContextModule],
    controllers: [SummaryController, SettingsController]
})
export class SpendingSummaryHttpModule {}
