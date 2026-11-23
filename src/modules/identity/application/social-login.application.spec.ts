import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../../core/context/app-context.port';
import { InvalidGoogleTokenError, PlatformDisabledError, PlatformOnlyError, ProviderDisabledError } from '../domain/identity.errors';
import { PlatformAuditDomain } from '../domain/platform-audit.domain';
import { SocialIdentity, User } from '../domain/identity.types';
import { AuthTokens, SessionIssuerPort } from '../ports/session-issuer.port';
import { SocialIdentityVerifierPort } from '../ports/social-identity-verifier.port';
import { AccountProvisioningService } from '../services/account-provisioning.service';
import { IdentityLogService } from '../services/identity-log.service';
import { IdentityMetricsService } from '../services/identity-metrics.service';
import { LoginOfferRegistry } from '../services/login-offer.registry';
import { PlatformAvailabilityService } from '../services/platform-availability.service';
import { PlatformLoginAuditService } from '../services/platform-login-audit.service';
import { SocialIdentityRegistry } from '../services/social-identity.registry';
import { SocialLoginApplication } from './social-login.application';

const IDENTITY: SocialIdentity = { provider: 'google', subject: 's', email: 'ana@example.test', emailVerified: true, name: 'Ana' };
const USER: User = { id: 'user-1', companyId: 'company-1' } as User;
const TOKENS: AuthTokens = { accessToken: 'a', refreshToken: 'r', user: { id: 'user-1' } as AuthTokens['user'] };

function build(
    options: {
        enabled?: boolean;
        verify?: () => Promise<SocialIdentity>;
        outcome?: string;
        platformUser?: User | null;
        platformEnabled?: boolean;
        offer?: () => Promise<unknown>;
    } = {}
): {
    application: SocialLoginApplication;
    metrics: Record<string, ReturnType<typeof vi.fn>>;
    logs: Record<string, ReturnType<typeof vi.fn>>;
    enrich: ReturnType<typeof vi.fn>;
    issue: ReturnType<typeof vi.fn>;
    resolve: ReturnType<typeof vi.fn>;
    resolvePlatformUser: ReturnType<typeof vi.fn>;
    record: ReturnType<typeof vi.fn>;
    redeemOffer: ReturnType<typeof vi.fn>;
} {
    const verifier: SocialIdentityVerifierPort = {
        provider: 'google',
        enabled: options.enabled ?? true,
        verify: options.verify ?? (() => Promise.resolve(IDENTITY))
    };
    const resolve: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ user: USER, outcome: options.outcome ?? 'success' });
    const resolvePlatformUser: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(options.platformUser ?? null);
    const record: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const issue: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(TOKENS);
    const enrich: ReturnType<typeof vi.fn> = vi.fn();
    const redeemOffer: ReturnType<typeof vi.fn> = vi.fn(
        options.offer ?? ((): Promise<unknown> => Promise.resolve({ redeemed: true, reason: null }))
    );
    const metrics: Record<string, ReturnType<typeof vi.fn>> = { login: vi.fn(), providerLatency: vi.fn() };
    const logs: Record<string, ReturnType<typeof vi.fn>> = { providerTokenRejected: vi.fn() };
    const application: SocialLoginApplication = new SocialLoginApplication(
        { for: () => verifier } as unknown as SocialIdentityRegistry,
        { resolve, resolvePlatformUser } as unknown as AccountProvisioningService,
        { issueForNewLogin: issue } as unknown as SessionIssuerPort,
        { get: () => ({ requestId: 'r', locale: 'en' }), enrich } as unknown as AppContext,
        logs as unknown as IdentityLogService,
        metrics as unknown as IdentityMetricsService,
        new PlatformLoginAuditService(
            { record } as unknown as PlatformAuditDomain,
            { enabled: () => options.platformEnabled ?? true } as unknown as PlatformAvailabilityService
        ),
        { redeem: redeemOffer } as unknown as LoginOfferRegistry
    );
    return { application, metrics, logs, enrich, issue, resolve, resolvePlatformUser, record, redeemOffer };
}

describe('SocialLoginApplication', () => {
    it('verifica, resolve a conta no locale da requisição e emite a sessão', async () => {
        const { application, resolve, issue, enrich, metrics } = build();

        const result = await application.login('google', 'credential', { ip: '203.0.113.1' });

        expect(result).toEqual({ tokens: TOKENS, isNewAccount: false, joinedAccount: false, offer: null });
        expect(resolve).toHaveBeenCalledWith(IDENTITY, 'en', undefined);
        expect(enrich).toHaveBeenCalledWith({ companyId: 'company-1', userId: 'user-1' });
        expect(issue).toHaveBeenCalledWith(USER, { ip: '203.0.113.1' }, 'google', 'app');
        expect(metrics['login']).toHaveBeenCalledWith('google', 'success');
        expect(metrics['providerLatency']).toHaveBeenCalledWith('google', expect.any(Number));
    });

    it('marca isNewAccount quando a conta foi criada', async () => {
        const { application, metrics } = build({ outcome: 'new_account' });

        expect((await application.login('google', 'credential', {})).isNewAccount).toBe(true);
        expect(metrics['login']).toHaveBeenCalledWith('google', 'new_account');
    });

    it('repassa o token do convite e marca joinedAccount quando a pessoa entrou numa conta', async () => {
        const { application, resolve, metrics } = build({ outcome: 'joined' });

        const result = await application.login('google', 'credential', {}, 'invite-token-aaaaaaaaaaaa');

        expect(result.joinedAccount).toBe(true);
        expect(result.isNewAccount).toBe(false);
        expect(resolve).toHaveBeenCalledWith(IDENTITY, 'en', 'invite-token-aaaaaaaaaaaa');
        expect(metrics['login']).toHaveBeenCalledWith('google', 'joined');
    });

    it('provedor desligado responde 503 sem tocar em nada', async () => {
        const { application, resolve, metrics } = build({ enabled: false });

        await expect(application.login('google', 'credential', {})).rejects.toBeInstanceOf(ProviderDisabledError);
        expect(resolve).not.toHaveBeenCalled();
        expect(metrics['login']).not.toHaveBeenCalled();
    });

    it('credencial recusada é logada com o código, contada como falha e não cria nada', async () => {
        const { application, resolve, logs, metrics } = build({
            verify: () => Promise.reject(new InvalidGoogleTokenError())
        });

        await expect(application.login('google', 'credential', {})).rejects.toBeInstanceOf(InvalidGoogleTokenError);
        expect(logs['providerTokenRejected']).toHaveBeenCalledWith('google', 'identity.invalid_google_token');
        expect(metrics['login']).toHaveBeenCalledWith('google', 'failed');
        expect(resolve).not.toHaveBeenCalled();
    });

    it('erro inesperado do verificador sobe sem log de rejeição', async () => {
        const { application, logs, metrics } = build({
            verify: () => Promise.reject(new Error('boom'))
        });

        await expect(application.login('google', 'credential', {})).rejects.toThrow('boom');
        expect(logs['providerTokenRejected']).not.toHaveBeenCalled();
        expect(metrics['login']).toHaveBeenCalledWith('google', 'failed');
    });

    describe('loginAdmin', () => {
        it('entra a pessoa da company de sistema, emite com a audiência admin e grava admin.login', async () => {
            const { application, issue, record, resolve, metrics } = build({ platformUser: USER });

            const result = await application.loginAdmin('credential', { ip: '203.0.113.1' });

            expect(result).toEqual({ tokens: TOKENS, isNewAccount: false, joinedAccount: false, offer: null });
            expect(issue).toHaveBeenCalledWith(USER, { ip: '203.0.113.1' }, 'google', 'admin');
            expect(record).toHaveBeenCalledWith({
                operatorUserId: 'user-1',
                action: 'admin.login',
                targetCompanyId: 'company-1',
                meta: { ip: '203.0.113.1' }
            });
            expect(resolve).not.toHaveBeenCalled();
            expect(metrics['login']).toHaveBeenCalledWith('google', 'success');
        });

        it('recusa quem não é da company de sistema, sem emitir sessão, e grava admin.denied', async () => {
            const { application, issue, record, metrics } = build({ platformUser: null });

            await expect(application.loginAdmin('credential', {})).rejects.toBeInstanceOf(PlatformOnlyError);

            expect(issue).not.toHaveBeenCalled();
            expect(record).toHaveBeenCalledWith({
                operatorUserId: null,
                action: 'admin.denied',
                targetCompanyId: null,
                meta: { reason: 'not_platform_user', ip: null }
            });
            expect(metrics['login']).toHaveBeenCalledWith('google', 'failed');
        });

        it('e-mail não verificado é recusado sem nem procurar a pessoa', async () => {
            const { application, resolvePlatformUser, record } = build({
                platformUser: USER,
                verify: () => Promise.resolve({ ...IDENTITY, emailVerified: false })
            });

            await expect(application.loginAdmin('credential', {})).rejects.toBeInstanceOf(PlatformOnlyError);

            expect(resolvePlatformUser).not.toHaveBeenCalled();
            expect(record).toHaveBeenCalledWith(expect.objectContaining({ meta: { reason: 'email_unverified', ip: null } }));
        });

        it('na auto-hospedada a audiência admin responde 404 antes de verificar a credencial', async () => {
            const { application, resolvePlatformUser } = build({ platformEnabled: false, platformUser: USER });

            await expect(application.loginAdmin('credential', {})).rejects.toBeInstanceOf(PlatformDisabledError);
            expect(resolvePlatformUser).not.toHaveBeenCalled();
        });

        it('Google desligado responde 503', async () => {
            const { application } = build({ enabled: false });

            await expect(application.loginAdmin('credential', {})).rejects.toBeInstanceOf(ProviderDisabledError);
        });
    });

    describe('oferta de link de cadastro', () => {
        it('resgata a oferta depois da sessão e devolve o resultado', async () => {
            const { application, redeemOffer } = build({ outcome: 'new_account' });

            const result = await application.login('google', 'credential', { ip: '203.0.113.1' }, undefined, 'offer-token-0000000');

            expect(result.offer).toEqual({ redeemed: true, reason: null });
            expect(redeemOffer).toHaveBeenCalledWith({ token: 'offer-token-0000000', user: USER, isNewAccount: true, ip: '203.0.113.1' });
        });

        it('recusa de regra de negócio não derruba o login: volta o código em offer.reason', async () => {
            const { application } = build({ offer: () => Promise.reject(new InvalidGoogleTokenError()) });

            const result = await application.login('google', 'credential', {}, undefined, 'offer-token-0000000');

            expect(result.offer).toEqual({ redeemed: false, reason: 'identity.invalid_google_token' });
        });

        it('erro inesperado do resgate não é engolido', async () => {
            const { application } = build({ offer: () => Promise.reject(new Error('boom')) });

            await expect(application.login('google', 'credential', {}, undefined, 'offer-token-0000000')).rejects.toThrow('boom');
        });

        it('sem token não chama o resgate', async () => {
            const { application, redeemOffer } = build();

            await application.login('google', 'credential', {});

            expect(redeemOffer).not.toHaveBeenCalled();
        });

        it('quem entrou numa conta por convite não resgata oferta', async () => {
            const { application, redeemOffer } = build({ outcome: 'joined' });

            const result = await application.login('google', 'credential', {}, 'invite-token-00000000', 'offer-token-0000000');

            expect(result.offer).toBeNull();
            expect(redeemOffer).not.toHaveBeenCalled();
        });

        it('na auto-hospedada o registro devolve null e o login segue sem oferta', async () => {
            const { application } = build({ offer: () => Promise.resolve(null) });

            const result = await application.login('google', 'credential', {}, undefined, 'offer-token-0000000');

            expect(result.offer).toBeNull();
        });
    });
});
