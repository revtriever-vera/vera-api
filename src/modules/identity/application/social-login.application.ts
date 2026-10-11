import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { AppError } from '../../../shared/errors/app.error';
import { ProviderDisabledError } from '../domain/identity.errors';
import { LOGIN_OUTCOMES, LoginProvider, SocialIdentity } from '../domain/identity.types';
import { AuthTokens, RequestMeta, SessionIssuerPort } from '../ports/session-issuer.port';
import { SocialIdentityVerifierPort } from '../ports/social-identity-verifier.port';
import { AccountProvisioningService, ProvisionResult } from '../services/account-provisioning.service';
import { IdentityLogService } from '../services/identity-log.service';
import { IdentityMetricsService } from '../services/identity-metrics.service';
import { SocialIdentityRegistry } from '../services/social-identity.registry';

const MS_PER_SECOND: number = 1000;

export interface SocialLoginResult {
    readonly tokens: AuthTokens;
    readonly isNewAccount: boolean;
}

@Injectable()
export class SocialLoginApplication {
    public constructor(
        private readonly registry: SocialIdentityRegistry,
        private readonly provisioning: AccountProvisioningService,
        private readonly sessionIssuer: SessionIssuerPort,
        private readonly context: AppContext,
        private readonly logs: IdentityLogService,
        private readonly metrics: IdentityMetricsService
    ) {}

    public async login(provider: LoginProvider, credential: string, meta: RequestMeta): Promise<SocialLoginResult> {
        const verifier: SocialIdentityVerifierPort = this.registry.for(provider);
        if (!verifier.enabled) {
            throw new ProviderDisabledError(provider);
        }
        try {
            return await this.authenticate(verifier, credential, meta);
        } catch (error: unknown) {
            this.metrics.login(provider, LOGIN_OUTCOMES.failed);
            throw error;
        }
    }

    private async authenticate(verifier: SocialIdentityVerifierPort, credential: string, meta: RequestMeta): Promise<SocialLoginResult> {
        const identity: SocialIdentity = await this.verified(verifier, credential);
        const result: ProvisionResult = await this.provisioning.resolve(identity, this.context.get().locale);
        this.context.enrich({ companyId: result.user.companyId, userId: result.user.id });
        const tokens: AuthTokens = await this.sessionIssuer.issueForNewLogin(result.user, meta, verifier.provider);
        this.metrics.login(verifier.provider, result.outcome);
        return { tokens, isNewAccount: result.outcome === LOGIN_OUTCOMES.newAccount };
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
