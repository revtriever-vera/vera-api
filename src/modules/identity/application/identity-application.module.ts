import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DiscoveryModule } from '@nestjs/core';
import { ContextModule } from '../../../core/context/context.module';
import { CryptoModule } from '../../../core/crypto/crypto.module';
import { MailModule } from '../../../core/mail/mail.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { ThrottleModule } from '../../../core/throttle/throttle.module';
import { authConfig } from '../config/auth.config';
import { membersConfig } from '../config/members.config';
import { IdentityDomainModule } from '../domain/identity-domain.module';
import { SessionIssuerPort } from '../ports/session-issuer.port';
import { AccountClosureMailer } from '../services/account-closure-mailer.service';
import { InviteAcceptanceService } from '../services/invite-acceptance.service';
import { MemberDirectoryService } from '../services/member-directory.service';
import { LoginOfferRegistry } from '../services/login-offer.registry';
import { MemberExitService } from '../services/member-exit.service';
import { AccountEmptinessService } from '../services/account-emptiness.service';
import { AccountInvitesExporter } from '../services/account-invites.exporter';
import { MemberDepartureRegistry } from '../services/member-departure.registry';
import { MembersLogService } from '../services/members-log.service';
import { MembersMailerService } from '../services/members-mailer.service';
import { MembersMetricsService } from '../services/members-metrics.service';
import { AccountDataRegistry } from '../services/account-data.registry';
import { AccountExportBuilder } from '../services/account-export.builder';
import { AccountSpreadsheetRegistry } from '../services/account-spreadsheet.registry';
import { AccountProvisioningService } from '../services/account-provisioning.service';
import { CompanyTimezoneService } from '../services/company-timezone.service';
import { CompanyTrialService } from '../services/company-trial.service';
import { UserLocaleService } from '../services/user-locale.service';
import { CurrentUserService } from '../services/current-user.service';
import { FacebookGraphClient } from '../services/facebook-graph.client';
import { FacebookIdentityVerifier } from '../services/facebook-identity.verifier';
import { GoogleIdentityVerifier } from '../services/google-identity.verifier';
import { IdentityAccountExporter } from '../services/identity-account.exporter';
import { IdentityLogService } from '../services/identity-log.service';
import { IdentityMetricsService } from '../services/identity-metrics.service';
import { JwtAuthGuard } from '../services/jwt-auth.guard';
import { PlatformAccountReaderService } from '../services/platform-account-reader.service';
import { SupportAccessService } from '../services/support-access.service';
import { PlatformAuditReaderService } from '../services/platform-audit-reader.service';
import { PlatformAuditRecorderService } from '../services/platform-audit-recorder.service';
import { PlatformAvailabilityService } from '../services/platform-availability.service';
import { PlatformLoginAuditService } from '../services/platform-login-audit.service';
import { PlatformSeedService } from '../services/platform-seed.service';
import { PlatformTokenGuard } from '../services/platform-token.guard';
import { PlatformTokenService } from '../services/platform-token.service';
import { PlatformEnabledGuard } from '../services/platform-enabled.guard';
import { PlatformGuard } from '../services/platform.guard';
import { RolesGuard } from '../services/roles.guard';
import { RefreshCookieAdapter } from '../services/refresh-cookie.adapter';
import { SessionIssuerService } from '../services/session-issuer.service';
import { SocialIdentityRegistry } from '../services/social-identity.registry';
import { TokenService } from '../services/token.service';
import { MemberRecipientsService } from '../services/member-recipients.service';
import { OwnerRecipientsService } from '../services/owner-recipients.service';
import { AdminSecurityMailerService } from '../services/admin-security-mailer.service';
import { PlatformLoginService } from '../services/platform-login.service';
import { RecoveryCodeService } from '../services/recovery-code.service';
import { SecondFactorCodesService } from '../services/second-factor-codes.service';
import { SecondFactorGateService } from '../services/second-factor-gate.service';
import { SecondFactorNotifierService } from '../services/second-factor-notifier.service';
import { TotpService } from '../services/totp.service';
import { AdminSecurityTemplates } from '../templates/admin-security.templates';
import { AccountDeletedTemplate } from '../templates/account-deleted.template';
import { MemberTemplates } from '../templates/member.templates';
import { AdminTotpApplication } from './admin-totp.application';
import { AccountDeletionApplication } from './account-deletion.application';
import { AccountExportApplication } from './account-export.application';
import { AccountSpreadsheetExportApplication } from './account-spreadsheet-export.application';
import { InvitesApplication } from './invites.application';
import { MembersApplication } from './members.application';
import { MembersCleanupApplication } from './members-cleanup.application';
import { ProfileApplication } from './profile.application';
import { SessionApplication } from './session.application';
import { SocialLoginApplication } from './social-login.application';

@Module({
    imports: [
        ConfigModule.forFeature(authConfig),
        ConfigModule.forFeature(membersConfig),
        DiscoveryModule,
        IdentityDomainModule,
        ContextModule,
        ObservabilityModule,
        MailModule,
        ThrottleModule,
        CryptoModule
    ],
    providers: [
        ProfileApplication,
        SessionApplication,
        SocialLoginApplication,
        AdminTotpApplication,
        AccountExportApplication,
        AccountSpreadsheetExportApplication,
        AccountDeletionApplication,
        MembersApplication,
        InvitesApplication,
        MembersCleanupApplication,
        AccountDataRegistry,
        AccountSpreadsheetRegistry,
        AccountExportBuilder,
        AccountEmptinessService,
        AccountClosureMailer,
        InviteAcceptanceService,
        LoginOfferRegistry,
        MemberExitService,
        AccountInvitesExporter,
        MemberDepartureRegistry,
        MemberDirectoryService,
        OwnerRecipientsService,
        MemberRecipientsService,
        MembersLogService,
        MembersMailerService,
        MembersMetricsService,
        MemberTemplates,
        IdentityAccountExporter,
        AccountDeletedTemplate,
        AccountProvisioningService,
        GoogleIdentityVerifier,
        FacebookIdentityVerifier,
        FacebookGraphClient,
        SocialIdentityRegistry,
        SessionIssuerService,
        { provide: SessionIssuerPort, useExisting: SessionIssuerService },
        CurrentUserService,
        CompanyTimezoneService,
        CompanyTrialService,
        UserLocaleService,
        JwtAuthGuard,
        RolesGuard,
        PlatformGuard,
        PlatformEnabledGuard,
        PlatformTokenGuard,
        PlatformTokenService,
        PlatformAvailabilityService,
        PlatformLoginAuditService,
        PlatformLoginService,
        TotpService,
        RecoveryCodeService,
        SecondFactorCodesService,
        SecondFactorGateService,
        SecondFactorNotifierService,
        AdminSecurityMailerService,
        AdminSecurityTemplates,
        PlatformSeedService,
        PlatformAuditReaderService,
        PlatformAuditRecorderService,
        PlatformAccountReaderService,
        SupportAccessService,
        RefreshCookieAdapter,
        TokenService,
        IdentityLogService,
        IdentityMetricsService
    ],
    exports: [
        ProfileApplication,
        SessionApplication,
        SocialLoginApplication,
        AdminTotpApplication,
        AccountExportApplication,
        AccountSpreadsheetExportApplication,
        AccountDeletionApplication,
        MembersApplication,
        InvitesApplication,
        MembersCleanupApplication,
        CurrentUserService,
        CompanyTimezoneService,
        CompanyTrialService,
        UserLocaleService,
        MemberDirectoryService,
        OwnerRecipientsService,
        MemberRecipientsService,
        JwtAuthGuard,
        RolesGuard,
        PlatformGuard,
        PlatformEnabledGuard,
        PlatformTokenGuard,
        PlatformTokenService,
        PlatformAvailabilityService,
        PlatformSeedService,
        PlatformAuditReaderService,
        PlatformAuditRecorderService,
        PlatformAccountReaderService,
        SupportAccessService,
        TokenService,
        RefreshCookieAdapter,
        SessionIssuerPort,
        IdentityLogService,
        IdentityMetricsService
    ]
})
export class IdentityApplicationModule {}
