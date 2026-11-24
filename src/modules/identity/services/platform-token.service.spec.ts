import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ThrottleService, TooManyAttemptsError } from '../../../core/throttle/throttle.service';
import { CompanyDomain } from '../domain/company.domain';
import { PlatformOnlyError, PlatformTokenNotFoundError, UnauthorizedError } from '../domain/identity.errors';
import { PlatformAccessToken, User } from '../domain/identity.types';
import { PlatformAccessTokenDomain } from '../domain/platform-access-token.domain';
import { UserDomain } from '../domain/user.domain';
import { PlatformTokenService } from './platform-token.service';

const SECRET: string = 'vera_pat_known-secret';
const NOW: number = Date.now();
const DAY: number = 86_400_000;

function tokenRow(overrides: Partial<PlatformAccessToken> = {}): PlatformAccessToken {
    return {
        id: 'token-1',
        name: 'laptop',
        tokenHash: createHash('sha256').update(SECRET).digest('hex'),
        tokenHint: 'cret',
        createdByUserId: 'user-1',
        expiresAt: new Date(NOW + DAY),
        lastUsedAt: null,
        revokedAt: null,
        createdAt: new Date(NOW - DAY),
        updatedAt: new Date(NOW - DAY),
        ...overrides
    };
}

interface Options {
    readonly row?: PlatformAccessToken | null;
    readonly user?: Partial<User> | null;
    readonly isPlatform?: boolean;
    readonly allowed?: boolean;
}

function build(options: Options = {}): {
    service: PlatformTokenService;
    domain: Record<'issue' | 'findByHash' | 'markUsed' | 'revoke' | 'listNewestFirst', ReturnType<typeof vi.fn>>;
} {
    const domain: Record<'issue' | 'findByHash' | 'markUsed' | 'revoke' | 'listNewestFirst', ReturnType<typeof vi.fn>> = {
        issue: vi.fn().mockImplementation((input: object) => Promise.resolve({ ...tokenRow(), ...input })),
        findByHash: vi.fn().mockResolvedValue(options.row === undefined ? tokenRow() : options.row),
        markUsed: vi.fn().mockResolvedValue(undefined),
        revoke: vi.fn().mockResolvedValue(tokenRow()),
        listNewestFirst: vi.fn().mockResolvedValue([])
    };
    const user: Partial<User> | null =
        options.user === undefined ? { id: 'user-1', companyId: 'company-1', removedAt: null } : options.user;
    const allowed: boolean = options.allowed ?? true;
    const service: PlatformTokenService = new PlatformTokenService(
        domain as unknown as PlatformAccessTokenDomain,
        { findByIdAcrossTenants: vi.fn().mockResolvedValue(user) } as unknown as UserDomain,
        {
            findById: vi.fn().mockResolvedValue({ id: 'company-1', isPlatform: options.isPlatform ?? true })
        } as unknown as CompanyDomain,
        {
            assertAllowed: vi.fn().mockImplementation(() => (allowed ? Promise.resolve() : Promise.reject(new TooManyAttemptsError())))
        } as unknown as ThrottleService
    );
    return { service, domain };
}

describe('PlatformTokenService', () => {
    it('emite um token vera_pat_ e guarda só o hash e os 4 últimos caracteres', async () => {
        const { service, domain } = build();

        const issued = await service.issue('user-1', 'laptop', 30);

        expect(issued.secret).toMatch(/^vera_pat_[A-Za-z0-9_-]{43}$/);
        const stored = domain.issue.mock.calls[0]?.[0] as { tokenHash: string; tokenHint: string; expiresAt: Date };
        expect(stored.tokenHash).toBe(createHash('sha256').update(issued.secret).digest('hex'));
        expect(stored.tokenHint).toBe(issued.secret.slice(-4));
        expect(JSON.stringify(stored)).not.toContain(issued.secret);
        expect(stored.expiresAt.getTime()).toBeGreaterThan(NOW + 29 * DAY);
    });

    it('autentica um token válido, devolve quem é e marca o uso', async () => {
        const { service, domain } = build();

        await expect(service.authenticate(SECRET)).resolves.toEqual({ tokenId: 'token-1', userId: 'user-1', companyId: 'company-1' });
        expect(domain.markUsed).toHaveBeenCalledTimes(1);
    });

    it('não regrava o último uso quando ele é de menos de um minuto', async () => {
        const { service, domain } = build({ row: tokenRow({ lastUsedAt: new Date(NOW - 1000) }) });

        await service.authenticate(SECRET);

        expect(domain.markUsed).not.toHaveBeenCalled();
    });

    it.each([
        ['desconhecido', { row: null }],
        ['revogado', { row: tokenRow({ revokedAt: new Date(NOW - 1000) }) }],
        ['expirado', { row: tokenRow({ expiresAt: new Date(NOW - 1000) }) }],
        ['de quem foi removido', { user: { id: 'user-1', companyId: 'company-1', removedAt: new Date() } }],
        ['de quem não existe mais', { user: null }]
    ] as [string, Options][])('recusa o token %s com 401', async (_label: string, options: Options) => {
        await expect(build(options).service.authenticate(SECRET)).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('recusa o que não começa com o prefixo sem consultar o banco', async () => {
        const { service, domain } = build();

        await expect(service.authenticate('eyJhbGciOi.jwt.token')).rejects.toBeInstanceOf(UnauthorizedError);
        expect(domain.findByHash).not.toHaveBeenCalled();
    });

    it('recusa com 403 o token de quem não é da company de plataforma', async () => {
        await expect(build({ isPlatform: false }).service.authenticate(SECRET)).rejects.toBeInstanceOf(PlatformOnlyError);
    });

    it('passa o limite por token adiante como 429', async () => {
        await expect(build({ allowed: false }).service.authenticate(SECRET)).rejects.toBeInstanceOf(TooManyAttemptsError);
    });

    it('revogar um token que não existe responde 404', async () => {
        const { service, domain } = build();
        domain.revoke.mockResolvedValue(null);

        await expect(service.revoke('missing')).rejects.toBeInstanceOf(PlatformTokenNotFoundError);
    });

    it('exige o usuário do contexto para criar', () => {
        const { service } = build();

        expect(() => service.operatorOf(undefined)).toThrow(UnauthorizedError);
        expect(service.operatorOf('user-1')).toBe('user-1');
    });
});
