import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { IdentityApplicationModule } from '../../identity/application/identity-application.module';
import { PlatformAdminApplicationModule } from '../application/platform-admin-application.module';
import { PlatformAuditController } from './platform-audit.controller';

@Module({
    imports: [PlatformAdminApplicationModule, IdentityApplicationModule, ContextModule],
    controllers: [PlatformAuditController]
})
export class PlatformAdminHttpModule {}
