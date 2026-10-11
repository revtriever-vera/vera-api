import { describe, expect, it, vi } from 'vitest';
import { SessionsRepository } from '../repositories/sessions.repository';
import { InvalidRefreshTokenError } from './identity.errors';
import { Session } from './identity.types';
import { SessionDomain } from './session.domain';

describe('SessionDomain', () => {
    it('getRefreshable devolve a sessão achada pelo hash', async () => {
        const found: Session = { id: 'session-1' } as Session;
        const repository: Partial<SessionsRepository> = { findByTokenHashAcrossTenants: vi.fn().mockResolvedValue(found) };
        const domain: SessionDomain = new SessionDomain(repository as SessionsRepository);

        await expect(domain.getRefreshable('hash')).resolves.toBe(found);
        expect(repository.findByTokenHashAcrossTenants).toHaveBeenCalledWith('hash');
    });

    it('getRefreshable lança invalid_refresh quando não acha', async () => {
        const repository: Partial<SessionsRepository> = { findByTokenHashAcrossTenants: vi.fn().mockResolvedValue(null) };
        const domain: SessionDomain = new SessionDomain(repository as SessionsRepository);

        await expect(domain.getRefreshable('hash')).rejects.toBeInstanceOf(InvalidRefreshTokenError);
    });

    it('delega emissão, rotação, revogação e busca ao repositório', async () => {
        const repository: Record<string, ReturnType<typeof vi.fn>> = {
            create: vi.fn().mockResolvedValue({ id: 'new' }),
            findById: vi.fn().mockResolvedValue({ id: 'one' }),
            rotate: vi.fn().mockResolvedValue(true),
            revoke: vi.fn().mockResolvedValue(undefined),
            revokeFamily: vi.fn().mockResolvedValue(3)
        };
        const domain: SessionDomain = new SessionDomain(repository as unknown as SessionsRepository);

        await expect(domain.issue({} as never)).resolves.toEqual({ id: 'new' });
        await expect(domain.findById('one')).resolves.toEqual({ id: 'one' });
        await expect(domain.rotate('a', 'b')).resolves.toBe(true);
        await domain.revoke('a');
        await expect(domain.revokeFamily('f')).resolves.toBe(3);
        expect(repository['rotate']).toHaveBeenCalledWith('a', 'b');
        expect(repository['revoke']).toHaveBeenCalledWith('a');
    });
});
