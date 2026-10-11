import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DiscoveryModule } from '@nestjs/core';
import { ContextModule } from '../../../core/context/context.module';
import { MailModule } from '../../../core/mail/mail.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { ThrottleModule } from '../../../core/throttle/throttle.module';
import { authConfig } from '../config/auth.config';
import { IdentityDomainModule } from '../domain/identity-domain.module';
import { SessionIssuerPort } from '../ports/session-issuer.port';
import { AccountDataRegistry } from '../services/account-data.registry';
import { AccountProvisioningService } from '../services/account-provisioning.service';
import { CurrentUserService } from '../services/current-user.service';
import { FacebookGraphClient } from '../services/facebook-graph.client';
import { FacebookIdentityVerifier } from '../services/facebook-identity.verifier';
import { GoogleIdentityVerifier } from '../services/google-identity.verifier';
import { IdentityAccountExporter } from '../services/identity-account.exporter';
import { IdentityLogService } from '../services/identity-log.service';
import { IdentityMetricsService } from '../services/identity-metrics.service';
import { JwtAuthGuard } from '../services/jwt-auth.guard';
import { RefreshCookieAdapter } from '../services/refresh-cookie.adapter';
import { SessionIssuerService } from '../services/session-issuer.service';
import { SocialIdentityRegistry } from '../services/social-identity.registry';
import { TokenService } from '../services/token.service';
import { AccountDeletedTemplate } from '../templates/account-deleted.template';
import { AccountDeletionApplication } from './account-deletion.application';
import { AccountExportApplication } from './account-export.application';
import { ProfileApplication } from './profile.application';
import { SessionApplication } from './session.application';
import { SocialLoginApplication } from './social-login.application';

@Module({
    imports: [
        ConfigModule.forFeature(authConfig),
        DiscoveryModule,
        IdentityDomainModule,
        ContextModule,
        ObservabilityModule,
        MailModule,
        ThrottleModule
    ],
    providers: [
        ProfileApplication,
        SessionApplication,
        SocialLoginApplication,
        AccountExportApplication,
        AccountDeletionApplication,
        AccountDataRegistry,
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
        JwtAuthGuard,
        RefreshCookieAdapter,
        TokenService,
        IdentityLogService,
        IdentityMetricsService
    ],
    exports: [
        ProfileApplication,
        SessionApplication,
        SocialLoginApplication,
        AccountExportApplication,
        AccountDeletionApplication,
        CurrentUserService,
        JwtAuthGuard,
        TokenService,
        RefreshCookieAdapter,
        SessionIssuerPort
    ]
})
export class IdentityApplicationModule {}
