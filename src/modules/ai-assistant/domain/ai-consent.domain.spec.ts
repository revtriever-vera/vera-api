import { describe, expect, it, vi } from 'vitest';
import { AiConsentsRepository } from '../repositories/ai-consents.repository';
import { AiConsentDomain } from './ai-consent.domain';

function domain(revoked: number) {
    const repository = {
        current: vi.fn().mockResolvedValue(null),
        grant: vi.fn().mockResolvedValue({ id: 'consent-1' }),
        revoke: vi.fn().mockResolvedValue(revoked),
        eraseAll: vi.fn().mockResolvedValue(1)
    };
    return { repository, domain: new AiConsentDomain(repository as unknown as AiConsentsRepository) };
}

describe('AiConsentDomain', () => {
    it('aceita guardando versão, origem e pessoa, inclusive a origem whatsapp_link', async () => {
        const { repository, domain: consents } = domain(0);

        await consents.grant({ noticeVersion: 1, source: 'whatsapp_link', userId: 'user-1' });

        expect(repository.grant).toHaveBeenCalledWith({ noticeVersion: 1, source: 'whatsapp_link', userId: 'user-1' });
    });

    it('desliga e informa se havia permissão ativa; desligar de novo é inofensivo', async () => {
        const first = domain(1);
        const second = domain(0);

        expect(await first.domain.revoke('user-1')).toBe(true);
        expect(await second.domain.revoke('user-1')).toBe(false);
        expect(first.repository.revoke).toHaveBeenCalledWith('user-1');
    });

    it('lê a permissão atual e apaga tudo da conta', async () => {
        const { repository, domain: consents } = domain(0);

        expect(await consents.current()).toBeNull();
        expect(await consents.eraseAll()).toBe(1);
        expect(repository.eraseAll).toHaveBeenCalled();
    });
});
