import { describe, expect, it, vi } from 'vitest';
import { AiConsentGuard } from './ai-consent.guard';
import { AiConsentService } from './ai-consent.service';

describe('AiConsentGuard', () => {
    it('deixa passar com permissão', async () => {
        const guard: AiConsentGuard = new AiConsentGuard({
            assertGranted: vi.fn().mockResolvedValue(undefined)
        } as unknown as AiConsentService);

        expect(await guard.canActivate()).toBe(true);
    });

    it('bloqueia com ai.consent_required sem permissão', async () => {
        const denied = Object.assign(new Error('x'), { code: 'ai.consent_required' });
        const guard: AiConsentGuard = new AiConsentGuard({
            assertGranted: vi.fn().mockRejectedValue(denied)
        } as unknown as AiConsentService);

        await expect(guard.canActivate()).rejects.toMatchObject({ code: 'ai.consent_required' });
    });
});
