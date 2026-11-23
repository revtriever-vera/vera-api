import { describe, expect, it, vi } from 'vitest';
import { HmacPort } from '../../../core/crypto/hmac.port';
import { SignupEmailMarkDomain } from '../domain/signup-email-mark.domain';
import { TrialEmailMarkService } from './trial-email-mark.service';

class FakeHmac extends HmacPort {
    public sha256Hex(value: string): string {
        return `hmac(${value})`;
    }
}

const CONFIG = { APP_URL: 'https://app.example.test', SIGNUP_EMAIL_MARK_HMAC_KEY: null, SIGNUP_REDEEM_IP_DAILY_LIMIT: 5 };

describe('TrialEmailMarkService', () => {
    it('o hash vem do e-mail canônico: variações do mesmo Gmail dão a mesma marca', () => {
        const service: TrialEmailMarkService = new TrialEmailMarkService({} as SignupEmailMarkDomain, new FakeHmac(), CONFIG);

        expect(service.hashOf('A.B+x@Gmail.com')).toBe(service.hashOf('ab@gmail.com'));
        expect(service.hashOf('ab@gmail.com')).not.toContain('@example');
    });

    it('com chave própria usa o HMAC com essa chave, diferente do padrão', () => {
        const withKey: TrialEmailMarkService = new TrialEmailMarkService({} as SignupEmailMarkDomain, new FakeHmac(), {
            ...CONFIG,
            SIGNUP_EMAIL_MARK_HMAC_KEY: 'k'.repeat(32)
        });
        const without: TrialEmailMarkService = new TrialEmailMarkService({} as SignupEmailMarkDomain, new FakeHmac(), CONFIG);

        expect(withKey.hashOf('ana@example.test')).toMatch(/^[0-9a-f]{64}$/);
        expect(withKey.hashOf('ana@example.test')).not.toBe(without.hashOf('ana@example.test'));
    });

    it('claim devolve se a marca era nova', async () => {
        const claim: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
        const service: TrialEmailMarkService = new TrialEmailMarkService(
            { claim } as unknown as SignupEmailMarkDomain,
            new FakeHmac(),
            CONFIG
        );

        expect(await service.claim('ana@example.test', 'link')).toBe(true);
        expect(await service.claim('ana@example.test', 'link')).toBe(false);
        expect(claim).toHaveBeenCalledWith(expect.stringContaining('hmac('), 'link');
    });
});
