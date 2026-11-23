import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { IdentityApplicationModule } from '../../identity/application/identity-application.module';
import { PlatformAdminApplicationModule } from '../application/platform-admin-application.module';
import { PlatformAccountsController } from './platform-accounts.controller';
import { SupportAccessController } from './support-access.controller';
import { PlatformAuditController } from './platform-audit.controller';

@Module({
    imports: [PlatformAdminApplicationModule, IdentityApplicationModule, ContextModule],
    controllers: [PlatformAuditController, PlatformAccountsController, SupportAccessController]
})
export class PlatformAdminHttpModule {}
