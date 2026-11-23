import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { AppError } from '../../../shared/errors/app.error';
import { PlatformOnlyError, ProviderDisabledError } from '../domain/identity.errors';
import { LOGIN_AUDIENCES, LOGIN_OUTCOMES, LOGIN_PROVIDERS, LoginProvider, SocialIdentity, User } from '../domain/identity.types';
import { AuthTokens, RequestMeta, SessionIssuerPort } from '../ports/session-issuer.port';
import { SocialIdentityVerifierPort } from '../ports/social-identity-verifier.port';
import { AccountProvisioningService, ProvisionResult } from '../services/account-provisioning.service';
import { IdentityLogService } from '../services/identity-log.service';
import { IdentityMetricsService } from '../services/identity-metrics.service';
import { LoginOfferOutcome } from '../services/login-offer.port';
import { LoginOfferRegistry } from '../services/login-offer.registry';
import { AdminLoginStep, PlatformLoginService } from '../services/platform-login.service';
import { SocialIdentityRegistry } from '../services/social-identity.registry';

const MS_PER_SECOND: number = 1000;

export interface SocialLoginResult {
    readonly tokens: AuthTokens;
    readonly isNewAccount: boolean;
    readonly joinedAccount: boolean;
    readonly offer: LoginOfferOutcome | null;
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
        private readonly platformLogin: PlatformLoginService,
        private readonly offers: LoginOfferRegistry
    ) {}

    public async login(
        provider: LoginProvider,
        credential: string,
        meta: RequestMeta,
        inviteToken?: string,
        offerToken?: string
    ): Promise<SocialLoginResult> {
        const verifier: SocialIdentityVerifierPort = this.registry.for(provider);
        if (!verifier.enabled) {
            throw new ProviderDisabledError(provider);
        }
        try {
            return await this.authenticate(verifier, credential, meta, inviteToken, offerToken);
        } catch (error: unknown) {
            this.metrics.login(provider, LOGIN_OUTCOMES.failed);
            throw error;
        }
    }

    public async loginAdmin(credential: string, meta: RequestMeta): Promise<AdminLoginStep> {
        this.platformLogin.assertEnabled();
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

    private async authenticateAdmin(verifier: SocialIdentityVerifierPort, credential: string, meta: RequestMeta): Promise<AdminLoginStep> {
        const identity: SocialIdentity = await this.verified(verifier, credential);
        const user: User | null = identity.emailVerified ? await this.provisioning.resolvePlatformUser(identity) : null;
        if (!user) {
            await this.platformLogin.denied(identity, meta.ip);
            throw new PlatformOnlyError();
        }
        this.context.enrich({ companyId: user.companyId, userId: user.id });
        return this.platformLogin.nextStep(user);
    }

    private async authenticate(
        verifier: SocialIdentityVerifierPort,
        credential: string,
        meta: RequestMeta,
        inviteToken?: string,
        offerToken?: string
    ): Promise<SocialLoginResult> {
        const identity: SocialIdentity = await this.verified(verifier, credential);
        const result: ProvisionResult = await this.provisioning.resolve(identity, this.context.get().locale, inviteToken);
        this.context.enrich({ companyId: result.user.companyId, userId: result.user.id });
        const tokens: AuthTokens = await this.sessionIssuer.issueForNewLogin(result.user, meta, verifier.provider, LOGIN_AUDIENCES.app);
        this.metrics.login(verifier.provider, result.outcome);
        const isNewAccount: boolean = result.outcome === LOGIN_OUTCOMES.newAccount;
        const joinedAccount: boolean = result.outcome === LOGIN_OUTCOMES.joined;
        const offer: LoginOfferOutcome | null =
            offerToken === undefined || joinedAccount ? null : await this.redeemOffer(offerToken, result.user, isNewAccount, meta);
        return { tokens, isNewAccount, joinedAccount, offer };
    }

    private async redeemOffer(token: string, user: User, isNewAccount: boolean, meta: RequestMeta): Promise<LoginOfferOutcome | null> {
        try {
            return await this.offers.redeem({ token, user, isNewAccount, ip: meta.ip ?? null });
        } catch (error: unknown) {
            if (error instanceof AppError) {
                return { redeemed: false, reason: error.code };
            }
            throw error;
        }
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
