import { describe, expect, it, vi } from 'vitest';
import { FixedIncomeTitleDomain } from '../domain/fixed-income-title.domain';
import { FixedIncomeHolderDepartureHandler } from './holder-departure.handler';

describe('FixedIncomeHolderDepartureHandler', () => {
    it('clears the holder of the titles of the person who left', async () => {
        const clearHolder = vi.fn().mockResolvedValue(2);
        const handler: FixedIncomeHolderDepartureHandler = new FixedIncomeHolderDepartureHandler({
            clearHolder
        } as unknown as FixedIncomeTitleDomain);

        await handler.onMemberRemoved('ana');

        expect(clearHolder).toHaveBeenCalledWith('ana');
        expect(handler.area).toBe('fixed-income-holder');
    });
});
