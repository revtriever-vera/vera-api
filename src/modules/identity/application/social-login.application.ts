import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { AppError } from '../../../shared/errors/app.error';
import { PlatformAuditDomain } from '../domain/platform-audit.domain';
import { PlatformDisabledError, PlatformOnlyError, ProviderDisabledError } from '../domain/identity.errors';
import {
    LOGIN_AUDIENCES,
    LOGIN_OUTCOMES,
    LOGIN_PROVIDERS,
    LoginProvider,
    PLATFORM_AUDIT_ACTIONS,
    SocialIdentity,
    User
} from '../domain/identity.types';
import { AuthTokens, RequestMeta, SessionIssuerPort } from '../ports/session-issuer.port';
import { SocialIdentityVerifierPort } from '../ports/social-identity-verifier.port';
import { AccountProvisioningService, ProvisionResult } from '../services/account-provisioning.service';
import { IdentityLogService } from '../services/identity-log.service';
import { IdentityMetricsService } from '../services/identity-metrics.service';
import { PlatformAvailabilityService } from '../services/platform-availability.service';
import { SocialIdentityRegistry } from '../services/social-identity.registry';

const MS_PER_SECOND: number = 1000;

export interface SocialLoginResult {
    readonly tokens: AuthTokens;
    readonly isNewAccount: boolean;
    readonly joinedAccount: boolean;
}

@Injectable()
export class SocialLoginApplication {
    public constructor(
        private readonly registry: SocialIdentityRegistry,
        private readonly provisioning: AccountProvisioningService,
        private readonly sessionIssuer: SessionIssuerPort,
        private readonly context: AppContext,
        private readonly logs: IdentityLogService,
        private readonly metrics: IdentityMetricsService,
        private readonly audit: PlatformAuditDomain,
        private readonly availability: PlatformAvailabilityService
    ) {}

    public async login(provider: LoginProvider, credential: string, meta: RequestMeta, inviteToken?: string): Promise<SocialLoginResult> {
        const verifier: SocialIdentityVerifierPort = this.registry.for(provider);
        if (!verifier.enabled) {
            throw new ProviderDisabledError(provider);
        }
        try {
            return await this.authenticate(verifier, credential, meta, inviteToken);
        } catch (error: unknown) {
            this.metrics.login(provider, LOGIN_OUTCOMES.failed);
            throw error;
        }
    }

    public async loginAdmin(credential: string, meta: RequestMeta): Promise<SocialLoginResult> {
        if (!this.availability.enabled()) {
            throw new PlatformDisabledError();
        }
        const verifier: SocialIdentityVerifierPort = this.registry.for(LOGIN_PROVIDERS.google);
        if (!verifier.enabled) {
            throw new ProviderDisabledError(verifier.provider);
        }
        try {
            return await this.authenticateAdmin(verifier, credential, meta);
        } catch (error: unknown) {
            this.metrics.login(verifier.provider, LOGIN_OUTCOMES.failed);
            throw error;
        }
    }

    private async authenticateAdmin(
        verifier: SocialIdentityVerifierPort,
        credential: string,
        meta: RequestMeta
    ): Promise<SocialLoginResult> {
        const identity: SocialIdentity = await this.verified(verifier, credential);
        const user: User | null = identity.emailVerified ? await this.provisioning.resolvePlatformUser(identity) : null;
        if (!user) {
            await this.recordDenied(identity, meta);
            throw new PlatformOnlyError();
        }
        this.context.enrich({ companyId: user.companyId, userId: user.id });
        const tokens: AuthTokens = await this.sessionIssuer.issueForNewLogin(user, meta, verifier.provider, LOGIN_AUDIENCES.admin);
        await this.audit.record({
            operatorUserId: user.id,
            action: PLATFORM_AUDIT_ACTIONS.login,
            targetCompanyId: user.companyId,
            meta: { ip: meta.ip ?? null }
        });
        this.metrics.login(verifier.provider, LOGIN_OUTCOMES.success);
        return { tokens, isNewAccount: false, joinedAccount: false };
    }

    private async recordDenied(identity: SocialIdentity, meta: RequestMeta): Promise<void> {
        await this.audit.record({
            operatorUserId: null,
            action: PLATFORM_AUDIT_ACTIONS.denied,
            targetCompanyId: null,
            meta: { reason: identity.emailVerified ? 'not_platform_user' : 'email_unverified', ip: meta.ip ?? null }
        });
    }

    private async authenticate(
        verifier: SocialIdentityVerifierPort,
        credential: string,
        meta: RequestMeta,
        inviteToken?: string
    ): Promise<SocialLoginResult> {
        const identity: SocialIdentity = await this.verified(verifier, credential);
        const result: ProvisionResult = await this.provisioning.resolve(identity, this.context.get().locale, inviteToken);
        this.context.enrich({ companyId: result.user.companyId, userId: result.user.id });
        const tokens: AuthTokens = await this.sessionIssuer.issueForNewLogin(result.user, meta, verifier.provider, LOGIN_AUDIENCES.app);
        this.metrics.login(verifier.provider, result.outcome);
        return {
            tokens,
            isNewAccount: result.outcome === LOGIN_OUTCOMES.newAccount,
            joinedAccount: result.outcome === LOGIN_OUTCOMES.joined
        };
    }

    private async verified(verifier: SocialIdentityVerifierPort, credential: string): Promise<SocialIdentity> {
        const startedAt: number = Date.now();
        try {
            return await verifier.verify(credential);
        } catch (error: unknown) {
            if (error instanceof AppError) {
                this.logs.providerTokenRejected(verifier.provider, error.code);
            }
            throw error;
        } finally {
            this.metrics.providerLatency(verifier.provider, (Date.now() - startedAt) / MS_PER_SECOND);
        }
    }
}
