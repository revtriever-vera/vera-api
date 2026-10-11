import { describe, expect, it, vi } from 'vitest';
import { AlsAppContext } from '../../../core/context/als-app-context';
import { CompanyDomain } from '../domain/company.domain';
import { AccountClosedError, UnauthorizedError } from '../domain/identity.errors';
import { Company, Session, User } from '../domain/identity.types';
import { SessionDomain } from '../domain/session.domain';
import { UserDomain } from '../domain/user.domain';
import { CurrentUserService } from '../services/current-user.service';
import { ProfileApplication, SessionProfile } from './profile.application';

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

const COMPANY: Company = {
    id: 'company-1',
    name: 'Ana',
    locale: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null
};

const SESSION: Session = {
    id: 'session-1',
    companyId: 'company-1',
    userId: 'user-1',
    familyId: 'family-1',
    tokenHash: 'hash',
    replacedById: null,
    provider: 'google',
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    ip: null,
    userAgent: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null
};

interface Doubles {
    readonly application: ProfileApplication;
    readonly updatePersonalLocale: ReturnType<typeof vi.fn>;
    readonly inRequest: <T>(fn: () => Promise<T>, sessionId?: string) => Promise<T>;
}

interface Options {
    readonly user?: User;
    readonly company?: Company | null;
    readonly session?: Session | null;
    readonly updated?: User | null;
}

function build(options: Options = {}): Doubles {
    const updatePersonalLocale: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(options.updated ?? null);
    const context: AlsAppContext = new AlsAppContext();
    const application: ProfileApplication = new ProfileApplication(
        { require: vi.fn().mockResolvedValue(options.user ?? makeUser()) } as unknown as CurrentUserService,
        { findById: vi.fn().mockResolvedValue(options.company === undefined ? COMPANY : options.company) } as unknown as CompanyDomain,
        { updatePersonalLocale } as unknown as UserDomain,
        { findById: vi.fn().mockResolvedValue(options.session === undefined ? SESSION : options.session) } as unknown as SessionDomain,
        context
    );
    const inRequest = async <T>(fn: () => Promise<T>, sessionId: string = 'session-1'): Promise<T> =>
        context.run({ requestId: 'r', locale: 'pt-BR', sessionId }, fn);
    return { application, updatePersonalLocale, inRequest };
}

describe('ProfileApplication.current', () => {
    it('monta o perfil seguindo o idioma da company quando não há preferência', async () => {
        const doubles: Doubles = build();

        const profile: SessionProfile = await doubles.inRequest(async () => doubles.application.current());

        expect(profile).toEqual({
            userId: 'user-1',
            companyId: 'company-1',
            name: 'Ana',
            email: 'ana@example.com',
            role: 'owner',
            locale: 'pt-BR',
            preferredLocale: null,
            loginProvider: 'google',
            companyName: 'Ana'
        });
    });

    it('a preferência pessoal vence a da company', async () => {
        const doubles: Doubles = build({ user: makeUser({ locale: 'en' }) });

        const profile: SessionProfile = await doubles.inRequest(async () => doubles.application.current());

        expect(profile.locale).toBe('en');
        expect(profile.preferredLocale).toBe('en');
    });

    it('lança account_closed quando a company foi apagada', async () => {
        const doubles: Doubles = build({ company: null });

        await expect(doubles.inRequest(async () => doubles.application.current())).rejects.toBeInstanceOf(AccountClosedError);
    });

    it('lança unauthorized quando a sessão do token não existe mais', async () => {
        const doubles: Doubles = build({ session: null });

        await expect(doubles.inRequest(async () => doubles.application.current())).rejects.toBeInstanceOf(UnauthorizedError);
    });
});

describe('ProfileApplication.updatePreferences', () => {
    it('grava a preferência pessoal e devolve o perfil atualizado', async () => {
        const doubles: Doubles = build({ updated: makeUser({ locale: 'en' }) });

        const profile: SessionProfile = await doubles.inRequest(async () => doubles.application.updatePreferences({ locale: 'en' }));

        expect(doubles.updatePersonalLocale).toHaveBeenCalledWith('user-1', 'en');
        expect(profile.preferredLocale).toBe('en');
        expect(profile.locale).toBe('en');
    });

    it('null volta a seguir o idioma da company', async () => {
        const doubles: Doubles = build({ user: makeUser({ locale: 'en' }), updated: makeUser({ locale: null }) });

        const profile: SessionProfile = await doubles.inRequest(async () => doubles.application.updatePreferences({ locale: null }));

        expect(doubles.updatePersonalLocale).toHaveBeenCalledWith('user-1', null);
        expect(profile.preferredLocale).toBeNull();
        expect(profile.locale).toBe('pt-BR');
    });

    it('sem campo, não grava nada', async () => {
        const doubles: Doubles = build();

        await doubles.inRequest(async () => doubles.application.updatePreferences({}));

        expect(doubles.updatePersonalLocale).not.toHaveBeenCalled();
    });

    it('se a gravação não achar o usuário, devolve o perfil que já tinha', async () => {
        const doubles: Doubles = build({ updated: null });

        const profile: SessionProfile = await doubles.inRequest(async () => doubles.application.updatePreferences({ locale: 'en' }));

        expect(profile.preferredLocale).toBeNull();
    });
});
