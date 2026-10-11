import { describe, expect, it, vi } from 'vitest';
import { AuthIdentityDomain } from '../domain/auth-identity.domain';
import { CompanyDomain } from '../domain/company.domain';
import { AccountClosedError } from '../domain/identity.errors';
import { AuthIdentity, Company, Session, User } from '../domain/identity.types';
import { SessionDomain } from '../domain/session.domain';
import { CurrentUserService } from './current-user.service';
import { IdentityAccountExporter } from './identity-account.exporter';

const AT: Date = new Date('2026-01-02T03:04:05.000Z');

const USER: User = {
    id: 'user-1',
    companyId: 'company-1',
    email: 'pessoa@example.test',
    name: 'Pessoa Teste',
    role: 'owner',
    locale: null,
    emailVerifiedAt: AT,
    termsAcceptedAt: AT,
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null
};

const COMPANY: Company = {
    id: 'company-1',
    name: 'Empresa Teste',
    locale: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null
};

const IDENTITY: AuthIdentity = {
    id: 'identity-1',
    companyId: 'company-1',
    userId: 'user-1',
    provider: 'google',
    subject: 'subject-secreto-123',
    email: 'pessoa@example.test',
    emailVerified: true,
    lastLoginAt: null,
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null
};

const SESSION: Session = {
    id: 'session-1',
    companyId: 'company-1',
    userId: 'user-1',
    familyId: 'family-1',
    tokenHash: 'hash-secreto-456',
    replacedById: null,
    provider: 'google',
    expiresAt: AT,
    revokedAt: null,
    ip: '203.0.113.7',
    userAgent: 'agente-de-teste',
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null
};

function build(company: Company | null = COMPANY): IdentityAccountExporter {
    return new IdentityAccountExporter(
        { require: vi.fn().mockResolvedValue(USER) } as unknown as CurrentUserService,
        { findById: vi.fn().mockResolvedValue(company) } as unknown as CompanyDomain,
        { listForUser: vi.fn().mockResolvedValue([IDENTITY]) } as unknown as AuthIdentityDomain,
        { listActive: vi.fn().mockResolvedValue([SESSION]) } as unknown as SessionDomain
    );
}

describe('IdentityAccountExporter', () => {
    it('exporta company, usuário, identidades e sessões ativas', async () => {
        await expect(build().export()).resolves.toEqual({
            company: { name: 'Empresa Teste', locale: 'pt-BR', timezone: 'America/Sao_Paulo', createdAt: AT.toISOString() },
            user: {
                name: 'Pessoa Teste',
                email: 'pessoa@example.test',
                role: 'owner',
                locale: null,
                termsAcceptedAt: AT.toISOString(),
                createdAt: AT.toISOString()
            },
            identities: [{ provider: 'google', createdAt: AT.toISOString(), lastLoginAt: null }],
            sessions: [{ createdAt: AT.toISOString(), ip: '203.0.113.7', userAgent: 'agente-de-teste' }]
        });
    });

    it('nunca inclui subject, hash de token nem identificadores internos', async () => {
        const serialized: string = JSON.stringify(await build().export());

        expect(serialized).not.toContain('subject-secreto-123');
        expect(serialized).not.toContain('hash-secreto-456');
        expect(serialized).not.toContain('tokenHash');
        expect(serialized).not.toContain('familyId');
    });

    it('exporta datas opcionais ausentes como null', async () => {
        const exporter: IdentityAccountExporter = new IdentityAccountExporter(
            { require: vi.fn().mockResolvedValue({ ...USER, termsAcceptedAt: null }) } as unknown as CurrentUserService,
            { findById: vi.fn().mockResolvedValue(COMPANY) } as unknown as CompanyDomain,
            { listForUser: vi.fn().mockResolvedValue([{ ...IDENTITY, lastLoginAt: AT }]) } as unknown as AuthIdentityDomain,
            { listActive: vi.fn().mockResolvedValue([]) } as unknown as SessionDomain
        );

        const exported: Awaited<ReturnType<IdentityAccountExporter['export']>> = await exporter.export();

        expect(exported.user.termsAcceptedAt).toBeNull();
        expect(exported.identities[0]?.lastLoginAt).toBe(AT.toISOString());
        expect(exported.sessions).toEqual([]);
    });

    it('falha com account_closed quando a company não existe', async () => {
        await expect(build(null).export()).rejects.toBeInstanceOf(AccountClosedError);
    });
});
