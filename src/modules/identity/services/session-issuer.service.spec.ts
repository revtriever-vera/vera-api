import { ConfigType } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { AlsAppContext } from '../../../core/context/als-app-context';
import { ContextHolder } from '../../../core/context/as-company.decorator';
import { authConfig } from '../config/auth.config';
import { CompanyDomain } from '../domain/company.domain';
import { AccountClosedError, InvalidRefreshTokenError, ReusedRefreshTokenError } from '../domain/identity.errors';
import { Company, Session, User } from '../domain/identity.types';
import { SessionDomain } from '../domain/session.domain';
import { UserDomain } from '../domain/user.domain';
import { AuthTokens } from '../ports/session-issuer.port';
import { IdentityLogService } from './identity-log.service';
import { IdentityMetricsService } from './identity-metrics.service';
import { SessionIssuerService } from './session-issuer.service';
import { TokenService } from './token.service';

const context: AlsAppContext = new AlsAppContext();
ContextHolder.set(context);

function makeUser(overrides: Partial<User> = {}): User {
    return {
        id: 'user-1',
        companyId: 'company-1',
        email: 'ana@example.com',
        name: 'Ana',
        role: 'owner',
        locale: null,
        emailVerifiedAt: null,
        termsAcceptedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        ...overrides
    };
}

function makeCompany(overrides: Partial<Company> = {}): Company {
    return {
        id: 'company-1',
        name: 'Ana',
        locale: 'pt-BR',
        timezone: 'America/Sao_Paulo',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        ...overrides
    };
}

function makeSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        companyId: 'company-1',
        userId: 'user-1',
        familyId: 'family-1',
        tokenHash: 'hash-1',
        replacedById: null,
        provider: 'google',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        ip: null,
        userAgent: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        ...overrides
    };
}

function refreshable(session: Session | null | undefined): ReturnType<typeof vi.fn> {
    return session === null
        ? vi.fn().mockRejectedValue(new InvalidRefreshTokenError())
        : vi.fn().mockResolvedValue(session ?? makeSession());
}

interface Doubles {
    readonly sessionDomain: Record<string, ReturnType<typeof vi.fn>>;
    readonly companyDomain: Record<string, ReturnType<typeof vi.fn>>;
    readonly userDomain: Record<string, ReturnType<typeof vi.fn>>;
    readonly signAccessToken: ReturnType<typeof vi.fn>;
    readonly logs: Record<string, ReturnType<typeof vi.fn>>;
    readonly metrics: ReturnType<typeof vi.fn>;
    readonly service: SessionIssuerService;
}

function build(overrides: { session?: Session | null; user?: User | null; company?: Company | null; rotated?: boolean } = {}): Doubles {
    const sessionDomain: Record<string, ReturnType<typeof vi.fn>> = {
        issue: vi.fn().mockResolvedValue(makeSession({ id: 'session-2' })),
        getRefreshable: refreshable(overrides.session),
        findByTokenHashAcrossTenants: vi.fn().mockResolvedValue(overrides.session === undefined ? makeSession() : overrides.session),
        rotate: vi.fn().mockResolvedValue(overrides.rotated ?? true),
        revoke: vi.fn().mockResolvedValue(undefined),
        revokeFamily: vi.fn().mockResolvedValue(2)
    };
    const companyDomain: Record<string, ReturnType<typeof vi.fn>> = {
        findById: vi.fn().mockResolvedValue(overrides.company === undefined ? makeCompany() : overrides.company)
    };
    const userDomain: Record<string, ReturnType<typeof vi.fn>> = {
        findById: vi.fn().mockResolvedValue(overrides.user === undefined ? makeUser() : overrides.user)
    };
    const signAccessToken: ReturnType<typeof vi.fn> = vi.fn().mockReturnValue('jwt');
    const tokens: Partial<TokenService> = {
        generateOpaqueToken: () => ({ raw: 'raw', hash: 'hash' }),
        hashToken: (raw: string): string => `hashed-${raw}`,
        signAccessToken
    };
    const logs: Record<string, ReturnType<typeof vi.fn>> = {
        loginSucceeded: vi.fn(),
        refreshed: vi.fn(),
        loggedOut: vi.fn(),
        refreshReuseDetected: vi.fn()
    };
    const metrics: ReturnType<typeof vi.fn> = vi.fn();
    const service: SessionIssuerService = new SessionIssuerService(
        sessionDomain as unknown as SessionDomain,
        companyDomain as unknown as CompanyDomain,
        userDomain as unknown as UserDomain,
        tokens as TokenService,
        logs as unknown as IdentityLogService,
        { refresh: metrics } as unknown as IdentityMetricsService,
        { REFRESH_TOKEN_TTL_DAYS: 30 } as ConfigType<typeof authConfig>
    );
    return { sessionDomain, companyDomain, userDomain, signAccessToken, logs, metrics, service };
}

const inRequest = async <T>(fn: () => Promise<T>): Promise<T> => context.run({ requestId: 'req-1', locale: 'pt-BR' }, fn);

describe('SessionIssuerService.issueForNewLogin', () => {
    it('emite tokens, grava só o hash do refresh e guarda o provedor', async () => {
        const doubles: Doubles = build();

        const tokens: AuthTokens = await inRequest(async () =>
            doubles.service.issueForNewLogin(makeUser(), { ip: '10.0.0.1', userAgent: 'agent' }, 'facebook')
        );

        expect(tokens.accessToken).toBe('jwt');
        expect(tokens.refreshToken).toBe('raw');
        expect(tokens.user).toEqual({ id: 'user-1', name: 'Ana', email: 'ana@example.com', role: 'owner', companyId: 'company-1' });
        expect(doubles.sessionDomain['issue']).toHaveBeenCalledWith(
            expect.objectContaining({ tokenHash: 'hash', provider: 'facebook', ip: '10.0.0.1', userAgent: 'agent', userId: 'user-1' })
        );
        expect(JSON.stringify(doubles.sessionDomain['issue']?.mock.calls)).not.toContain('"raw"');
        expect(doubles.logs['loginSucceeded']).toHaveBeenCalledWith('user-1', 'facebook');
    });

    it('roda dentro do contexto da company do usuário', async () => {
        const doubles: Doubles = build();
        let seen: string | undefined;
        doubles.companyDomain['findById'] = vi.fn((): Promise<Company> => {
            seen = context.get().companyId;
            return Promise.resolve(makeCompany());
        });

        await inRequest(async () => doubles.service.issueForNewLogin(makeUser({ companyId: 'company-9' }), {}, 'google'));

        expect(seen).toBe('company-9');
    });

    it('leva no claim o idioma efetivo: o pessoal vence o da company', async () => {
        const doubles: Doubles = build({ company: makeCompany({ locale: 'pt-BR' }) });

        await inRequest(async () => doubles.service.issueForNewLogin(makeUser({ locale: 'en' }), {}, 'google'));

        expect(doubles.signAccessToken).toHaveBeenCalledWith('user-1', 'company-1', 'session-2', 'en');
    });

    it('lança account_closed quando a company foi apagada', async () => {
        const doubles: Doubles = build({ company: null });

        await expect(inRequest(async () => doubles.service.issueForNewLogin(makeUser(), {}, 'google'))).rejects.toBeInstanceOf(
            AccountClosedError
        );
    });
});

describe('SessionIssuerService.refresh', () => {
    it('rotação: cria sessão na mesma família, herda provedor e validade e marca a anterior', async () => {
        const expiresAt: Date = new Date(Date.now() + 5 * 60_000);
        const doubles: Doubles = build({ session: makeSession({ provider: 'facebook', expiresAt }) });

        const tokens: AuthTokens = await inRequest(async () => doubles.service.refresh('raw-token', {}));

        expect(tokens.refreshToken).toBe('raw');
        expect(doubles.sessionDomain['issue']).toHaveBeenCalledWith(
            expect.objectContaining({ familyId: 'family-1', provider: 'facebook', expiresAt })
        );
        expect(doubles.sessionDomain['rotate']).toHaveBeenCalledWith('session-1', 'session-2');
        expect(doubles.sessionDomain['getRefreshable']).toHaveBeenCalledWith('hashed-raw-token');
        expect(doubles.metrics).toHaveBeenCalledWith('success');
    });

    it('reuso: revoga a família inteira, registra e conta como reused', async () => {
        const doubles: Doubles = build({ session: makeSession({ replacedById: 'session-2' }) });

        await expect(inRequest(async () => doubles.service.refresh('raw-token', {}))).rejects.toBeInstanceOf(ReusedRefreshTokenError);

        expect(doubles.sessionDomain['revokeFamily']).toHaveBeenCalledWith('family-1');
        expect(doubles.logs['refreshReuseDetected']).toHaveBeenCalledWith('family-1', 2, 'user-1');
        expect(doubles.sessionDomain['issue']).not.toHaveBeenCalled();
        expect(doubles.metrics).toHaveBeenCalledWith('reused');
    });

    it('corrida: se a troca atômica perde, trata como reuso e revoga a família', async () => {
        const doubles: Doubles = build({ rotated: false });

        await expect(inRequest(async () => doubles.service.refresh('raw-token', {}))).rejects.toBeInstanceOf(ReusedRefreshTokenError);

        expect(doubles.sessionDomain['revokeFamily']).toHaveBeenCalledWith('family-1');
    });

    it('sessão revogada ou expirada vira invalid_refresh', async () => {
        const revoked: Doubles = build({ session: makeSession({ revokedAt: new Date() }) });
        const expired: Doubles = build({ session: makeSession({ expiresAt: new Date(Date.now() - 1000) }) });

        await expect(inRequest(async () => revoked.service.refresh('raw', {}))).rejects.toBeInstanceOf(InvalidRefreshTokenError);
        await expect(inRequest(async () => expired.service.refresh('raw', {}))).rejects.toBeInstanceOf(InvalidRefreshTokenError);
        expect(revoked.metrics).toHaveBeenCalledWith('invalid');
    });

    it('usuário apagado vira invalid_refresh', async () => {
        const doubles: Doubles = build({ user: null });

        await expect(inRequest(async () => doubles.service.refresh('raw', {}))).rejects.toBeInstanceOf(InvalidRefreshTokenError);
    });

    it('company apagada vira account_closed e conta como invalid', async () => {
        const doubles: Doubles = build({ company: null });

        await expect(inRequest(async () => doubles.service.refresh('raw', {}))).rejects.toBeInstanceOf(AccountClosedError);
        expect(doubles.metrics).toHaveBeenCalledWith('invalid');
    });

    it('token desconhecido vira invalid_refresh', async () => {
        const doubles: Doubles = build({ session: null });

        await expect(inRequest(async () => doubles.service.refresh('raw', {}))).rejects.toBeInstanceOf(InvalidRefreshTokenError);
    });

    it('erro inesperado não é contado como falha de refresh', async () => {
        const doubles: Doubles = build();
        doubles.sessionDomain['getRefreshable'] = vi.fn().mockRejectedValue(new Error('db down'));

        await expect(inRequest(async () => doubles.service.refresh('raw', {}))).rejects.toThrow('db down');
        expect(doubles.metrics).not.toHaveBeenCalled();
    });
});

describe('SessionIssuerService.logout', () => {
    it('revoga a sessão do cookie', async () => {
        const doubles: Doubles = build();

        await inRequest(async () => doubles.service.logout('raw-token'));

        expect(doubles.sessionDomain['revoke']).toHaveBeenCalledWith('session-1');
        expect(doubles.logs['loggedOut']).toHaveBeenCalledWith('user-1');
    });

    it('é idempotente para cookie desconhecido', async () => {
        const doubles: Doubles = build({ session: null });

        await expect(inRequest(async () => doubles.service.logout('raw-token'))).resolves.toBeUndefined();
        expect(doubles.sessionDomain['revoke']).not.toHaveBeenCalled();
    });
});
