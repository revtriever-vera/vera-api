import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../../core/context/app-context.port';
import { InvalidGoogleTokenError, ProviderDisabledError } from '../domain/identity.errors';
import { SocialIdentity, User } from '../domain/identity.types';
import { AuthTokens, SessionIssuerPort } from '../ports/session-issuer.port';
import { SocialIdentityVerifierPort } from '../ports/social-identity-verifier.port';
import { AccountProvisioningService } from '../services/account-provisioning.service';
import { IdentityLogService } from '../services/identity-log.service';
import { IdentityMetricsService } from '../services/identity-metrics.service';
import { SocialIdentityRegistry } from '../services/social-identity.registry';
import { SocialLoginApplication } from './social-login.application';

const IDENTITY: SocialIdentity = { provider: 'google', subject: 's', email: 'ana@example.test', emailVerified: true, name: 'Ana' };
const USER: User = { id: 'user-1', companyId: 'company-1' } as User;
const TOKENS: AuthTokens = { accessToken: 'a', refreshToken: 'r', user: { id: 'user-1' } as AuthTokens['user'] };

function build(options: { enabled?: boolean; verify?: () => Promise<SocialIdentity>; outcome?: string } = {}): {
    application: SocialLoginApplication;
    metrics: Record<string, ReturnType<typeof vi.fn>>;
    logs: Record<string, ReturnType<typeof vi.fn>>;
    enrich: ReturnType<typeof vi.fn>;
    issue: ReturnType<typeof vi.fn>;
    resolve: ReturnType<typeof vi.fn>;
} {
    const verifier: SocialIdentityVerifierPort = {
        provider: 'google',
        enabled: options.enabled ?? true,
        verify: options.verify ?? (() => Promise.resolve(IDENTITY))
    };
    const resolve: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ user: USER, outcome: options.outcome ?? 'success' });
    const issue: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(TOKENS);
    const enrich: ReturnType<typeof vi.fn> = vi.fn();
    const metrics: Record<string, ReturnType<typeof vi.fn>> = { login: vi.fn(), providerLatency: vi.fn() };
    const logs: Record<string, ReturnType<typeof vi.fn>> = { providerTokenRejected: vi.fn() };
    const application: SocialLoginApplication = new SocialLoginApplication(
        { for: () => verifier } as unknown as SocialIdentityRegistry,
        { resolve } as unknown as AccountProvisioningService,
        { issueForNewLogin: issue } as unknown as SessionIssuerPort,
        { get: () => ({ requestId: 'r', locale: 'en' }), enrich } as unknown as AppContext,
        logs as unknown as IdentityLogService,
        metrics as unknown as IdentityMetricsService
    );
    return { application, metrics, logs, enrich, issue, resolve };
}

describe('SocialLoginApplication', () => {
    it('verifica, resolve a conta no locale da requisição e emite a sessão', async () => {
        const { application, resolve, issue, enrich, metrics } = build();

        const result = await application.login('google', 'credential', { ip: '203.0.113.1' });

        expect(result).toEqual({ tokens: TOKENS, isNewAccount: false });
        expect(resolve).toHaveBeenCalledWith(IDENTITY, 'en');
        expect(enrich).toHaveBeenCalledWith({ companyId: 'company-1', userId: 'user-1' });
        expect(issue).toHaveBeenCalledWith(USER, { ip: '203.0.113.1' }, 'google');
        expect(metrics['login']).toHaveBeenCalledWith('google', 'success');
        expect(metrics['providerLatency']).toHaveBeenCalledWith('google', expect.any(Number));
    });

    it('marca isNewAccount quando a conta foi criada', async () => {
        const { application, metrics } = build({ outcome: 'new_account' });

        expect((await application.login('google', 'credential', {})).isNewAccount).toBe(true);
        expect(metrics['login']).toHaveBeenCalledWith('google', 'new_account');
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
});
