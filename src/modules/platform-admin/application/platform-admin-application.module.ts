import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { BillingApplicationModule } from '../../billing/application/billing-application.module';
import { IdentityApplicationModule } from '../../identity/application/identity-application.module';
import { PlansApplicationModule } from '../../plans/application/plans-application.module';
import { PlatformAccountsService } from '../services/platform-accounts.service';
import { PlatformAuditService } from '../services/platform-audit.service';
import { PlatformAccountsApplication } from './platform-accounts.application';
import { PlatformAuditApplication } from './platform-audit.application';
import { SupportAccessApplication } from './support-access.application';

@Module({
    imports: [BillingApplicationModule, IdentityApplicationModule, PlansApplicationModule, ContextModule],
    providers: [
        PlatformAuditService,
        PlatformAccountsService,
        PlatformAuditApplication,
        PlatformAccountsApplication,
        SupportAccessApplication
    ],
    exports: [
        PlatformAuditApplication,
        PlatformAccountsApplication,
        SupportAccessApplication,
        PlatformAccountsService,
        PlatformAuditService
    ]
})
export class PlatformAdminApplicationModule {}
