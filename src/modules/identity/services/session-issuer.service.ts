import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { AppLocale } from '../../../shared/i18n/locale';
import { authConfig } from '../config/auth.config';
import { CompanyDomain } from '../domain/company.domain';
import { AccountClosedError, InvalidRefreshTokenError, ReusedRefreshTokenError } from '../domain/identity.errors';
import {
    Company,
    effectiveLocale,
    LoginProvider,
    REFRESH_OUTCOMES,
    RefreshOutcome,
    Session,
    User,
    UserRole
} from '../domain/identity.types';
import { SessionDomain } from '../domain/session.domain';
import { UserDomain } from '../domain/user.domain';
import { SessionValidation } from '../domain/validations/session.validation';
import { AuthTokens, RequestMeta, SessionIssuerPort, SessionUser } from '../ports/session-issuer.port';
import { IdentityLogService } from './identity-log.service';
import { IdentityMetricsService } from './identity-metrics.service';
import { OpaqueToken, TokenService } from './token.service';

interface IssueInput {
    readonly user: User;
    readonly company: Company;
    readonly familyId: string;
    readonly meta: RequestMeta;
    readonly expiresAt: Date;
    readonly provider: LoginProvider;
}

interface Issued {
    readonly sessionId: string;
    readonly tokens: AuthTokens;
}

const DAY_MS: number = 24 * 60 * 60 * 1000;

@Injectable()
export class SessionIssuerService implements SessionIssuerPort {
    public constructor(
        private readonly sessionDomain: SessionDomain,
        private readonly companyDomain: CompanyDomain,
        private readonly userDomain: UserDomain,
        private readonly tokens: TokenService,
        private readonly logs: IdentityLogService,
        private readonly metrics: IdentityMetricsService,
        @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>
    ) {}

    public async issueForNewLogin(user: User, meta: RequestMeta, provider: LoginProvider): Promise<AuthTokens> {
        return this.issueInCompany(user.companyId, user, meta, provider);
    }

    public async refresh(rawRefreshToken: string, meta: RequestMeta): Promise<AuthTokens> {
        try {
            const session: Session = await this.sessionDomain.getRefreshable(this.tokens.hashToken(rawRefreshToken));
            const tokens: AuthTokens = await this.refreshInCompany(session.companyId, session, meta);
            this.metrics.refresh(REFRESH_OUTCOMES.success);
            return tokens;
        } catch (error: unknown) {
            this.countFailure(error);
            throw error;
        }
    }

    public async logout(rawRefreshToken: string): Promise<void> {
        const session: Session | null = await this.sessionDomain.findByTokenHashAcrossTenants(this.tokens.hashToken(rawRefreshToken));
        if (session) {
            await this.revokeInCompany(session.companyId, session);
        }
    }

    @AsCompany()
    private async issueInCompany(_companyId: string, user: User, meta: RequestMeta, provider: LoginProvider): Promise<AuthTokens> {
        const company: Company = await this.requireOpenCompany(user.companyId);
        const issued: Issued = await this.issue({
            user,
            company,
            familyId: crypto.randomUUID(),
            meta,
            expiresAt: this.regularExpiry(),
            provider
        });
        this.logs.loginSucceeded(user.id, provider);
        return issued.tokens;
    }

    @AsCompany()
    private async refreshInCompany(_companyId: string, session: Session, meta: RequestMeta): Promise<AuthTokens> {
        if (SessionValidation.isReused(session)) {
            return this.handleReuse(session);
        }
        SessionValidation.assertActive(session);
        const user: User | null = await this.userDomain.findById(session.userId);
        if (!user) {
            throw new InvalidRefreshTokenError();
        }
        const tokens: AuthTokens = await this.rotateInto(session, user, meta);
        this.logs.refreshed(user.id);
        return tokens;
    }

    @AsCompany()
    private async revokeInCompany(_companyId: string, session: Session): Promise<void> {
        await this.sessionDomain.revoke(session.id);
        this.logs.loggedOut(session.userId);
    }

    private async rotateInto(session: Session, user: User, meta: RequestMeta): Promise<AuthTokens> {
        const company: Company = await this.requireOpenCompany(user.companyId);
        const issued: Issued = await this.issue({
            user,
            company,
            familyId: session.familyId,
            meta,
            expiresAt: session.expiresAt,
            provider: session.provider as LoginProvider
        });
        const rotated: boolean = await this.sessionDomain.rotate(session.id, issued.sessionId);
        return rotated ? issued.tokens : this.handleReuse(session);
    }

    private async handleReuse(session: Session): Promise<never> {
        const revoked: number = await this.sessionDomain.revokeFamily(session.familyId);
        this.logs.refreshReuseDetected(session.familyId, revoked, session.userId);
        throw new ReusedRefreshTokenError();
    }

    private async requireOpenCompany(companyId: string): Promise<Company> {
        const company: Company | null = await this.companyDomain.findById(companyId);
        if (!company) {
            throw new AccountClosedError(companyId);
        }
        return company;
    }

    private regularExpiry(): Date {
        return new Date(Date.now() + this.config.REFRESH_TOKEN_TTL_DAYS * DAY_MS);
    }

    private async issue(input: IssueInput): Promise<Issued> {
        const opaque: OpaqueToken = this.tokens.generateOpaqueToken();
        const session: Session = await this.sessionDomain.issue({
            userId: input.user.id,
            familyId: input.familyId,
            tokenHash: opaque.hash,
            provider: input.provider,
            expiresAt: input.expiresAt,
            ip: input.meta.ip ?? null,
            userAgent: input.meta.userAgent ?? null
        });
        const locale: AppLocale = effectiveLocale(input.user, input.company);
        return {
            sessionId: session.id,
            tokens: {
                accessToken: this.tokens.signAccessToken(input.user.id, input.user.companyId, session.id, locale),
                refreshToken: opaque.raw,
                user: this.sessionUserOf(input.user)
            }
        };
    }

    private sessionUserOf(user: User): SessionUser {
        return { id: user.id, name: user.name, email: user.email, role: user.role as UserRole, companyId: user.companyId };
    }

    private countFailure(error: unknown): void {
        const outcome: RefreshOutcome | null = this.failureOutcome(error);
        if (outcome !== null) {
            this.metrics.refresh(outcome);
        }
    }

    private failureOutcome(error: unknown): RefreshOutcome | null {
        if (error instanceof ReusedRefreshTokenError) {
            return REFRESH_OUTCOMES.reused;
        }
        if (error instanceof InvalidRefreshTokenError || error instanceof AccountClosedError) {
            return REFRESH_OUTCOMES.invalid;
        }
        return null;
    }
}
