import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AlsAppContext } from '../../../core/context/als-app-context';
import { ContextHolder } from '../../../core/context/as-company.decorator';
import { DatabaseClient } from '../../../core/database/database.client';
import { TransactionalContext } from '../../../core/database/using-transaction.decorator';
import { InvalidTotpCodeError, InvalidTotpTokenError } from '../domain/identity.errors';
import { User, UserTotp } from '../domain/identity.types';
import { UserDomain } from '../domain/user.domain';
import { UserTotpDomain } from '../domain/user-totp.domain';
import { AuthTokens, SessionIssuerPort } from '../ports/session-issuer.port';
import { IdentityMetricsService } from '../services/identity-metrics.service';
import { SecondFactorCodesService } from '../services/second-factor-codes.service';
import { SecondFactorGateService } from '../services/second-factor-gate.service';
import { SecondFactorNotifierService } from '../services/second-factor-notifier.service';
import { AdminTotpApplication } from './admin-totp.application';

const context: AlsAppContext = new AlsAppContext();
ContextHolder.set(context);
TransactionalContext.set({ withTransaction: async (fn: () => Promise<unknown>) => fn() } as unknown as DatabaseClient);

const USER: User = { id: 'user-1', companyId: 'company-1', email: 'admin@example.test' } as User;
const PENDING: UserTotp = { id: 'totp-1', userId: 'user-1', activatedAt: null, secretEncrypted: 'enc' } as UserTotp;
const ACTIVE: UserTotp = { ...PENDING, activatedAt: new Date() };
const TOKENS: AuthTokens = { accessToken: 'jwt', refreshToken: 'raw', user: { id: 'user-1' } as AuthTokens['user'] };
const META: { ip: string } = { ip: '203.0.113.1' };

interface Harness {
    readonly app: AdminTotpApplication;
    readonly fns: Record<string, ReturnType<typeof vi.fn>>;
}

function build(): Harness {
    const fns: Record<string, ReturnType<typeof vi.fn>> = {
        beginEnrollment: vi.fn().mockResolvedValue(PENDING),
        requirePending: vi.fn().mockResolvedValue(PENDING),
        requireActive: vi.fn().mockResolvedValue(ACTIVE),
        activate: vi.fn().mockResolvedValue(undefined),
        claimStep: vi.fn().mockResolvedValue(true),
        consumeRecoveryCode: vi.fn().mockResolvedValue(true),
        findById: vi.fn().mockResolvedValue(USER),
        newSecret: vi.fn().mockReturnValue({ plain: 'SECRET', encrypted: 'enc', otpauthUri: 'otpauth://totp/x' }),
        looksLikeTotpCode: vi.fn((code: string): boolean => /^\d{6}$/.test(code)),
        stepOf: vi.fn().mockReturnValue(100),
        newRecoveryBatch: vi.fn().mockReturnValue({ codes: ['aaaaa-bbbbb'], hashes: ['hash-1'] }),
        recoveryHash: vi.fn().mockReturnValue('hash-of-input'),
        issueForPlatform: vi.fn().mockResolvedValue(TOKENS),
        claims: vi.fn().mockReturnValue({ sub: 'user-1', companyId: 'company-1' }),
        admit: vi.fn().mockResolvedValue(undefined),
        cleared: vi.fn().mockResolvedValue(undefined),
        enrolled: vi.fn().mockResolvedValue(undefined),
        recoveryCodeUsed: vi.fn().mockResolvedValue(undefined),
        signedIn: vi.fn().mockResolvedValue(undefined),
        enrich: vi.fn(),
        login: vi.fn()
    };
    const app: AdminTotpApplication = new AdminTotpApplication(
        fns as unknown as UserTotpDomain,
        { findById: fns['findById'] } as unknown as UserDomain,
        fns as unknown as SecondFactorCodesService,
        { issueForPlatform: fns['issueForPlatform'] } as unknown as SessionIssuerPort,
        fns as unknown as SecondFactorGateService,
        fns as unknown as SecondFactorNotifierService,
        { enrich: fns['enrich'] } as unknown as AlsAppContext,
        { login: fns['login'] } as unknown as IdentityMetricsService
    );
    return { app, fns };
}

const run = <T>(fn: () => Promise<T>): Promise<T> => context.run({ requestId: 'r', locale: 'pt-BR' }, fn);

describe('AdminTotpApplication', () => {
    let h: Harness;

    beforeEach(() => {
        h = build();
    });

    describe('enroll', () => {
        it('guarda o segredo cifrado e devolve o segredo e a URI', async () => {
            expect(await run(async () => h.app.enroll('setup'))).toEqual({ secret: 'SECRET', otpauthUri: 'otpauth://totp/x' });

            expect(h.fns['claims']).toHaveBeenCalledWith('setup', 'totp_enrollment');
            expect(h.fns['enrich']).toHaveBeenCalledWith({ companyId: 'company-1', userId: 'user-1' });
            expect(h.fns['beginEnrollment']).toHaveBeenCalledWith('user-1', 'enc');
        });

        it('usuário que sumiu invalida o token', async () => {
            h.fns['findById']?.mockResolvedValue(null);

            await expect(run(async () => h.app.enroll('setup'))).rejects.toBeInstanceOf(InvalidTotpTokenError);
        });
    });

    describe('activate', () => {
        it('com o primeiro código certo ativa, devolve os códigos de recuperação e a sessão, avisa e audita', async () => {
            const result = await run(async () => h.app.activate('setup', '123456', META));

            expect(result).toEqual({ tokens: TOKENS, recoveryCodes: ['aaaaa-bbbbb'] });
            expect(h.fns['admit']).toHaveBeenCalledWith(USER, '203.0.113.1');
            expect(h.fns['activate']).toHaveBeenCalledWith(PENDING, 100, ['hash-1']);
            expect(h.fns['enrolled']).toHaveBeenCalledWith(USER, '203.0.113.1');
            expect(h.fns['issueForPlatform']).toHaveBeenCalledWith(USER, META, 'google', { userId: 'user-1', method: 'totp' });
            expect(h.fns['signedIn']).toHaveBeenCalledWith(USER, '203.0.113.1');
            expect(h.fns['login']).toHaveBeenCalledWith('google', 'success');
        });

        it('código errado não ativa, não avisa e não emite sessão', async () => {
            h.fns['stepOf']?.mockReturnValue(null);

            await expect(run(async () => h.app.activate('setup', '123456', META))).rejects.toBeInstanceOf(InvalidTotpCodeError);

            expect(h.fns['cleared']).not.toHaveBeenCalled();
            expect(h.fns['activate']).not.toHaveBeenCalled();
            expect(h.fns['enrolled']).not.toHaveBeenCalled();
            expect(h.fns['issueForPlatform']).not.toHaveBeenCalled();
        });
    });

    describe('verify', () => {
        it('código do app: consome o passo e emite a sessão com a prova', async () => {
            expect(await run(async () => h.app.verify('challenge', '123456', META))).toBe(TOKENS);

            expect(h.fns['claims']).toHaveBeenCalledWith('challenge', 'totp_challenge');
            expect(h.fns['claimStep']).toHaveBeenCalledWith(ACTIVE, 100);
            expect(h.fns['issueForPlatform']).toHaveBeenCalledWith(USER, META, 'google', { userId: 'user-1', method: 'totp' });
            expect(h.fns['recoveryCodeUsed']).not.toHaveBeenCalled();
            expect(h.fns['cleared']).toHaveBeenCalledWith(USER);
        });

        it('código repetido (passo já usado) é recusado sem sessão', async () => {
            h.fns['claimStep']?.mockResolvedValue(false);

            await expect(run(async () => h.app.verify('challenge', '123456', META))).rejects.toBeInstanceOf(InvalidTotpCodeError);
            expect(h.fns['cleared']).not.toHaveBeenCalled();
            expect(h.fns['issueForPlatform']).not.toHaveBeenCalled();
        });

        it('código fora da janela é recusado', async () => {
            h.fns['stepOf']?.mockReturnValue(null);

            await expect(run(async () => h.app.verify('challenge', '123456', META))).rejects.toBeInstanceOf(InvalidTotpCodeError);
            expect(h.fns['claimStep']).not.toHaveBeenCalled();
        });

        it('código de recuperação: consome por hash, avisa e audita o uso', async () => {
            await run(async () => h.app.verify('challenge', 'aaaaa-bbbbb', META));

            expect(h.fns['recoveryHash']).toHaveBeenCalledWith('aaaaa-bbbbb');
            expect(h.fns['consumeRecoveryCode']).toHaveBeenCalledWith('user-1', 'hash-of-input');
            expect(h.fns['recoveryCodeUsed']).toHaveBeenCalledWith(USER, '203.0.113.1');
            expect(h.fns['issueForPlatform']).toHaveBeenCalledWith(USER, META, 'google', { userId: 'user-1', method: 'recovery_code' });
        });

        it('código de recuperação já usado ou desconhecido é recusado sem aviso', async () => {
            h.fns['consumeRecoveryCode']?.mockResolvedValue(false);

            await expect(run(async () => h.app.verify('challenge', 'aaaaa-bbbbb', META))).rejects.toBeInstanceOf(InvalidTotpCodeError);
            expect(h.fns['recoveryCodeUsed']).not.toHaveBeenCalled();
            expect(h.fns['issueForPlatform']).not.toHaveBeenCalled();
        });

        it('a tentativa passa pelo limite antes de olhar o código', async () => {
            h.fns['admit']?.mockRejectedValue(new Error('locked'));

            await expect(run(async () => h.app.verify('challenge', '123456', META))).rejects.toThrow('locked');
            expect(h.fns['requireActive']).not.toHaveBeenCalled();
        });
    });
});
