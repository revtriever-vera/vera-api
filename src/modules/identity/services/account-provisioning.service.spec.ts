import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AlsAppContext } from '../../../core/context/als-app-context';
import { ContextHolder } from '../../../core/context/as-company.decorator';
import { DatabaseClient } from '../../../core/database/database.client';
import { TransactionalContext } from '../../../core/database/using-transaction.decorator';
import { AuthIdentityDomain } from '../domain/auth-identity.domain';
import { CompanyDomain } from '../domain/company.domain';
import { AccountClosedError, EmailInUseError, EmailNotProvidedError } from '../domain/identity.errors';
import { AuthIdentity, SocialIdentity, User } from '../domain/identity.types';
import { UserDomain } from '../domain/user.domain';
import { AccountProvisioningService, ProvisionResult } from './account-provisioning.service';
import { IdentityLogService } from './identity-log.service';

const context: AlsAppContext = new AlsAppContext();
ContextHolder.set(context);
TransactionalContext.set({ withTransaction: async (fn: () => Promise<unknown>) => fn() } as unknown as DatabaseClient);

function makeUser(overrides: Partial<User> = {}): User {
    return {
        id: 'user-1',
        companyId: 'company-1',
        email: 'ana@example.test',
        name: 'Ana',
        role: 'owner',
        locale: null,
        emailVerifiedAt: new Date(),
        termsAcceptedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        ...overrides
    };
}

function makeIdentityRow(overrides: Partial<AuthIdentity> = {}): AuthIdentity {
    return {
        id: 'identity-1',
        companyId: 'company-1',
        userId: 'user-1',
        provider: 'google',
        subject: 'sub-1',
        email: 'ana@example.test',
        emailVerified: true,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        ...overrides
    };
}

function google(overrides: Partial<SocialIdentity> = {}): SocialIdentity {
    return { provider: 'google', subject: 'sub-1', email: 'ana@example.test', emailVerified: true, name: 'Ana Souza', ...overrides };
}

function facebook(overrides: Partial<SocialIdentity> = {}): SocialIdentity {
    return { provider: 'facebook', subject: 'fb-1', email: 'ana@example.test', emailVerified: false, name: 'Ana Souza', ...overrides };
}

function uniqueViolation(constraint: string): Error {
    return Object.assign(new Error('duplicate'), { code: '23505', constraint });
}

interface Harness {
    readonly service: AccountProvisioningService;
    readonly createCompany: ReturnType<typeof vi.fn>;
    readonly createOwner: ReturnType<typeof vi.fn>;
    readonly findByEmail: ReturnType<typeof vi.fn>;
    readonly findUserById: ReturnType<typeof vi.fn>;
    readonly findIdentity: ReturnType<typeof vi.fn>;
    readonly link: ReturnType<typeof vi.fn>;
    readonly touchLogin: ReturnType<typeof vi.fn>;
    readonly logs: Record<string, ReturnType<typeof vi.fn>>;
}

function build(): Harness {
    const createCompany: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ id: 'company-new' });
    const createOwner: ReturnType<typeof vi.fn> = vi.fn((input: { email: string }) =>
        Promise.resolve(makeUser({ id: 'user-new', companyId: context.get().companyId ?? 'missing', email: input.email }))
    );
    const findByEmail: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(null);
    const findUserById: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(makeUser());
    const findIdentity: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(null);
    const link: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(makeIdentityRow());
    const touchLogin: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const logs: Record<string, ReturnType<typeof vi.fn>> = {
        companyProvisioned: vi.fn(),
        identityLinked: vi.fn(),
        emailNotProvided: vi.fn()
    };
    const service: AccountProvisioningService = new AccountProvisioningService(
        { create: createCompany } as unknown as CompanyDomain,
        { createOwner, findByEmailAcrossTenants: findByEmail, findById: findUserById } as unknown as UserDomain,
        { findByProviderSubjectAcrossTenants: findIdentity, link, touchLogin } as unknown as AuthIdentityDomain,
        logs as unknown as IdentityLogService
    );
    return { service, createCompany, createOwner, findByEmail, findUserById, findIdentity, link, touchLogin, logs };
}

function run<T>(fn: () => Promise<T>): Promise<T> {
    return context.run({ requestId: 'test', locale: 'pt-BR' }, fn);
}

describe('AccountProvisioningService', () => {
    let harness: Harness;

    beforeEach(() => {
        harness = build();
    });

    it('identidade conhecida entra na company dela sem olhar o e-mail', async () => {
        harness.findIdentity.mockResolvedValue(makeIdentityRow());

        const result: ProvisionResult = await run(async () => harness.service.resolve(google({ email: 'outro@example.test' }), 'pt-BR'));

        expect(result.outcome).toBe('success');
        expect(result.user.id).toBe('user-1');
        expect(harness.findByEmail).not.toHaveBeenCalled();
        expect(harness.touchLogin).toHaveBeenCalledWith('identity-1');
        expect(harness.createCompany).not.toHaveBeenCalled();
    });

    it('identidade conhecida cujo usuário sumiu é conta encerrada', async () => {
        harness.findIdentity.mockResolvedValue(makeIdentityRow());
        harness.findUserById.mockResolvedValue(null);

        await expect(run(async () => harness.service.resolve(google(), 'pt-BR'))).rejects.toBeInstanceOf(AccountClosedError);
    });

    it('e-mail verificado dos dois lados vincula à company do usuário existente', async () => {
        harness.findByEmail.mockResolvedValue(makeUser({ id: 'user-9', companyId: 'company-9' }));

        const result: ProvisionResult = await run(async () => harness.service.resolve(google(), 'pt-BR'));

        expect(result).toMatchObject({ outcome: 'linked', user: { id: 'user-9' } });
        expect(harness.link).toHaveBeenCalledWith('user-9', expect.objectContaining({ provider: 'google', subject: 'sub-1' }));
        expect(harness.logs['identityLinked']).toHaveBeenCalledWith('user-9', 'google');
        expect(harness.createCompany).not.toHaveBeenCalled();
    });

    it('e-mail existente com emailVerifiedAt nulo recusa o vínculo', async () => {
        harness.findByEmail.mockResolvedValue(makeUser({ emailVerifiedAt: null }));

        await expect(run(async () => harness.service.resolve(google(), 'pt-BR'))).rejects.toBeInstanceOf(EmailInUseError);
        expect(harness.link).not.toHaveBeenCalled();
    });

    it('identidade com e-mail não verificado (Facebook) nunca vincula', async () => {
        harness.findByEmail.mockResolvedValue(makeUser());

        await expect(run(async () => harness.service.resolve(facebook(), 'pt-BR'))).rejects.toBeInstanceOf(EmailInUseError);
        expect(harness.link).not.toHaveBeenCalled();
        expect(harness.createCompany).not.toHaveBeenCalled();
    });

    it('identidade sem e-mail não cria nada', async () => {
        await expect(run(async () => harness.service.resolve(facebook({ email: null }), 'pt-BR'))).rejects.toBeInstanceOf(
            EmailNotProvidedError
        );
        expect(harness.createCompany).not.toHaveBeenCalled();
        expect(harness.createOwner).not.toHaveBeenCalled();
        expect(harness.logs['emailNotProvided']).toHaveBeenCalledWith('facebook');
    });

    it('pessoa nova cria company, owner e identidade, com o locale da requisição', async () => {
        const result: ProvisionResult = await run(async () => harness.service.resolve(google(), 'en'));

        expect(result.outcome).toBe('new_account');
        expect(harness.createCompany).toHaveBeenCalledWith({ name: 'Ana Souza', locale: 'en' });
        expect(harness.createOwner).toHaveBeenCalledWith(
            expect.objectContaining({
                email: 'ana@example.test',
                name: 'Ana Souza',
                emailVerifiedAt: expect.any(Date),
                termsAcceptedAt: expect.any(Date)
            })
        );
        expect(harness.link).toHaveBeenCalledWith('user-new', expect.objectContaining({ subject: 'sub-1' }));
        expect(harness.logs['companyProvisioned']).toHaveBeenCalledWith('company-new', 'user-new', 'google');
    });

    it('usuário novo do Facebook nasce com emailVerifiedAt nulo e nome vindo do e-mail quando falta', async () => {
        await run(async () => harness.service.resolve(facebook({ name: null, email: 'maria.silva@example.test' }), 'pt-BR'));

        expect(harness.createCompany).toHaveBeenCalledWith({ name: 'Maria Silva', locale: 'pt-BR' });
        expect(harness.createOwner).toHaveBeenCalledWith(expect.objectContaining({ emailVerifiedAt: null }));
    });

    it.each(['Users_email_unique', 'AuthIdentities_provider_subject_unique'])(
        'conflito de unicidade %s refaz a busca uma vez e entra pelo vencedor',
        async (constraint: string) => {
            harness.createCompany.mockRejectedValueOnce(uniqueViolation(constraint));
            harness.findIdentity.mockResolvedValueOnce(null).mockResolvedValueOnce(makeIdentityRow());

            const result: ProvisionResult = await run(async () => harness.service.resolve(google(), 'pt-BR'));

            expect(result.outcome).toBe('success');
            expect(harness.createCompany).toHaveBeenCalledTimes(1);
        }
    );

    it('se o segundo round também falha, o erro sobe sem terceira tentativa', async () => {
        harness.createCompany.mockRejectedValue(uniqueViolation('Users_email_unique'));

        await expect(run(async () => harness.service.resolve(google(), 'pt-BR'))).rejects.toMatchObject({ code: '23505' });
        expect(harness.createCompany).toHaveBeenCalledTimes(2);
    });

    it('erros que não são de unicidade sobem direto', async () => {
        harness.createCompany.mockRejectedValue(new Error('db down'));

        await expect(run(async () => harness.service.resolve(google(), 'pt-BR'))).rejects.toThrow('db down');
        expect(harness.createCompany).toHaveBeenCalledTimes(1);
    });
});
