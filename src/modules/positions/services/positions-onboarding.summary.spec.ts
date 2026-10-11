import { describe, expect, it, vi } from 'vitest';
import { PositionDomain } from '../domain/position.domain';
import { PositionsOnboardingSummary } from './positions-onboarding.summary';

describe('PositionsOnboardingSummary', () => {
    it('conta posições reais e deixa o valor nulo até a consolidação', async () => {
        const summary: PositionsOnboardingSummary = new PositionsOnboardingSummary({
            countReal: vi.fn().mockResolvedValue(3)
        } as unknown as PositionDomain);

        expect(summary.area).toBe('assets');
        await expect(summary.summarize()).resolves.toEqual({ items: 3, amountCents: null, currency: null });
    });
});
