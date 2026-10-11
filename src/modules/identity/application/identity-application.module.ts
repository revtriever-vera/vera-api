import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ContextModule } from '../../../core/context/context.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { authConfig } from '../config/auth.config';
import { IdentityDomainModule } from '../domain/identity-domain.module';
import { SessionIssuerPort } from '../ports/session-issuer.port';
import { CurrentUserService } from '../services/current-user.service';
import { IdentityLogService } from '../services/identity-log.service';
import { IdentityMetricsService } from '../services/identity-metrics.service';
import { JwtAuthGuard } from '../services/jwt-auth.guard';
import { RefreshCookieAdapter } from '../services/refresh-cookie.adapter';
import { SessionIssuerService } from '../services/session-issuer.service';
import { TokenService } from '../services/token.service';
import { ProfileApplication } from './profile.application';
import { SessionApplication } from './session.application';

@Module({
    imports: [ConfigModule.forFeature(authConfig), IdentityDomainModule, ContextModule, ObservabilityModule],
    providers: [
        ProfileApplication,
        SessionApplication,
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
        CurrentUserService,
        JwtAuthGuard,
        TokenService,
        RefreshCookieAdapter,
        SessionIssuerPort
    ]
})
export class IdentityApplicationModule {}
