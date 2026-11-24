import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { BillingApplicationModule } from '../../billing/application/billing-application.module';
import { IdentityApplicationModule } from '../../identity/application/identity-application.module';
import { PlatformAdminApplicationModule } from '../../platform-admin/application/platform-admin-application.module';
import { SignupLinksApplicationModule } from '../../signup-links/application/signup-links-application.module';
import { PlatformReadToolsService } from '../services/platform-read-tools.service';
import { PlatformWriteToolsService } from '../services/platform-write-tools.service';
import { PlatformMcpApplication } from './platform-mcp.application';
import { PlatformTokensApplication } from './platform-tokens.application';

@Module({
    imports: [
        IdentityApplicationModule,
        PlatformAdminApplicationModule,
        SignupLinksApplicationModule,
        BillingApplicationModule,
        ContextModule
    ],
    providers: [PlatformReadToolsService, PlatformWriteToolsService, PlatformMcpApplication, PlatformTokensApplication],
    exports: [PlatformMcpApplication, PlatformTokensApplication]
})
export class PlatformMcpApplicationModule {}
