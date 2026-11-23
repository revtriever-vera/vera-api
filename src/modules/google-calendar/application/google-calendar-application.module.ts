import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DiscoveryModule } from '@nestjs/core';
import { ContextModule } from '../../../core/context/context.module';
import { CryptoModule } from '../../../core/crypto/crypto.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { IdentityApplicationModule } from '../../identity/application/identity-application.module';
import { IntegrationCredentialsApplicationModule } from '../../integration-credentials/application/integration-credentials-application.module';
import { PlansApplicationModule } from '../../plans/application/plans-application.module';
import { googleCalendarConfig } from '../config/google-calendar.config';
import { GoogleCalendarDomainModule } from '../domain/google-calendar-domain.module';
import { GoogleCalendarAdapter } from '../drivers/google-calendar.adapter';
import { GoogleOAuthHttp } from '../drivers/google-oauth-http';
import { MockCalendarAdapter } from '../drivers/mock-calendar.adapter';
import { CalendarAdapterRegistry } from '../services/calendar-adapter.registry';
import { CalendarAccountSpreadsheet } from '../services/calendar-account.exporter';
import { CalendarAccountEraser } from '../services/calendar-account.eraser';
import { CalendarAvailability } from '../services/calendar-availability';
import { CalendarCreateEventTool, CalendarListEventsTool } from '../services/calendar-ask-vera.tools';
import { CalendarClientService } from '../services/calendar-client.service';
import { CalendarEnrollmentService } from '../services/calendar-enrollment.service';
import { CalendarCredentialsResealer } from '../services/calendar-credentials.resealer';
import { CalendarCredentialsService } from '../services/calendar-credentials.service';
import { CalendarLogService } from '../services/calendar-log.service';
import { CalendarMemberLifecycle } from '../services/calendar-member.lifecycle';
import { CalendarMetricsService } from '../services/calendar-metrics.service';
import { CalendarCreateExecutor } from '../services/calendar-pending-actions';
import { CalendarPremiumLifecycle } from '../services/calendar-premium.lifecycle';
import { CalendarProposalService } from '../services/calendar-proposal.service';
import { CalendarStateService } from '../services/calendar-state.service';
import { CalendarVaultService } from '../services/calendar-vault.service';
import { CalendarConnectionApplication } from './calendar-connection.application';
import { CalendarOauthApplication } from './calendar-oauth.application';

@Module({
    imports: [
        ConfigModule.forFeature(googleCalendarConfig),
        DiscoveryModule,
        GoogleCalendarDomainModule,
        IdentityApplicationModule,
        IntegrationCredentialsApplicationModule,
        PlansApplicationModule,
        CryptoModule,
        ContextModule,
        ObservabilityModule
    ],
    providers: [
        CalendarOauthApplication,
        CalendarConnectionApplication,
        GoogleOAuthHttp,
        GoogleCalendarAdapter,
        MockCalendarAdapter,
        CalendarAdapterRegistry,
        CalendarCredentialsService,
        CalendarVaultService,
        CalendarStateService,
        CalendarClientService,
        CalendarEnrollmentService,
        CalendarProposalService,
        CalendarCreateExecutor,
        CalendarListEventsTool,
        CalendarCreateEventTool,
        CalendarAvailability,
        CalendarPremiumLifecycle,
        CalendarMemberLifecycle,
        CalendarAccountEraser,
        CalendarAccountSpreadsheet,
        CalendarCredentialsResealer,
        CalendarLogService,
        CalendarMetricsService
    ],
    exports: [CalendarOauthApplication, CalendarConnectionApplication]
})
export class GoogleCalendarApplicationModule {}
