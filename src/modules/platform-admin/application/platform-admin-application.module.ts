import { Module } from '@nestjs/common';
import { IdentityApplicationModule } from '../../identity/application/identity-application.module';
import { PlatformAuditApplication } from './platform-audit.application';

@Module({
    imports: [IdentityApplicationModule],
    providers: [PlatformAuditApplication],
    exports: [PlatformAuditApplication]
})
export class PlatformAdminApplicationModule {}
