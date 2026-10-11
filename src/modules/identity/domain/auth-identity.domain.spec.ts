import { describe, expect, it, vi } from 'vitest';
import { AuthIdentitiesRepository } from '../repositories/auth-identities.repository';
import { AuthIdentityDomain } from './auth-identity.domain';

describe('AuthIdentityDomain', () => {
    it('vincula guardando o que o provedor devolveu e o instante do login', async () => {
        const create: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ id: 'identity-1' });
        const domain: AuthIdentityDomain = new AuthIdentityDomain({ create } as unknown as AuthIdentitiesRepository);

        await domain.link('user-1', { provider: 'facebook', subject: 'fb-1', email: 'a@example.test', emailVerified: false, name: 'A' });

        expect(create).toHaveBeenCalledWith({
            userId: 'user-1',
            provider: 'facebook',
            subject: 'fb-1',
            email: 'a@example.test',
            emailVerified: false,
            lastLoginAt: expect.any(Date)
        });
    });

    it('busca por provedor e subject e registra o login', async () => {
        const find: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(null);
        const touchLogin: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(null);
        const domain: AuthIdentityDomain = new AuthIdentityDomain({
            findByProviderSubjectAcrossTenants: find,
            touchLogin
        } as unknown as AuthIdentitiesRepository);

        await domain.findByProviderSubjectAcrossTenants('google', 'sub-1');
        await domain.touchLogin('identity-1');

        expect(find).toHaveBeenCalledWith('google', 'sub-1');
        expect(touchLogin).toHaveBeenCalledWith('identity-1', expect.any(Date));
    });

    it('lista as identidades do usuário', async () => {
        const findByUser: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue([{ id: 'identity-1' }]);
        const domain: AuthIdentityDomain = new AuthIdentityDomain({ findByUser } as unknown as AuthIdentitiesRepository);

        await expect(domain.listForUser('user-1')).resolves.toEqual([{ id: 'identity-1' }]);
        expect(findByUser).toHaveBeenCalledWith('user-1');
    });
});
