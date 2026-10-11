import { describe, expect, it, vi } from 'vitest';
import { UsersRepository } from '../repositories/users.repository';
import { UserDomain } from './user.domain';

describe('UserDomain', () => {
    it('cria o owner com e-mail em minúsculas', async () => {
        const create: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ id: 'user-1' });
        const domain: UserDomain = new UserDomain({ create } as unknown as UsersRepository);
        const verifiedAt: Date = new Date();

        await domain.createOwner({ email: 'Ana@Example.COM', name: 'Ana', emailVerifiedAt: verifiedAt, termsAcceptedAt: null });

        expect(create).toHaveBeenCalledWith({
            email: 'ana@example.com',
            name: 'Ana',
            role: 'owner',
            emailVerifiedAt: verifiedAt,
            termsAcceptedAt: null
        });
    });

    it('busca por e-mail normalizando para minúsculas', async () => {
        const findByEmailAcrossTenants: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(null);
        const domain: UserDomain = new UserDomain({ findByEmailAcrossTenants } as unknown as UsersRepository);

        await domain.findByEmailAcrossTenants('ANA@Example.com');

        expect(findByEmailAcrossTenants).toHaveBeenCalledWith('ana@example.com');
    });

    it('delega busca por id e troca de idioma', async () => {
        const repository: Record<string, ReturnType<typeof vi.fn>> = {
            findById: vi.fn().mockResolvedValue({ id: 'user-1' }),
            updatePersonalLocale: vi.fn().mockResolvedValue({ id: 'user-1', locale: 'en' })
        };
        const domain: UserDomain = new UserDomain(repository as unknown as UsersRepository);

        await expect(domain.findById('user-1')).resolves.toEqual({ id: 'user-1' });
        await expect(domain.updatePersonalLocale('user-1', 'en')).resolves.toEqual({ id: 'user-1', locale: 'en' });
        expect(repository['updatePersonalLocale']).toHaveBeenCalledWith('user-1', 'en');
    });
});
