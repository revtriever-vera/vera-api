import { describe, expect, it, vi } from 'vitest';
import { PositionDomain } from '../domain/position.domain';
import { PositionsHolderDepartureHandler } from './holder-departure.handler';

describe('PositionsHolderDepartureHandler', () => {
    it('clears the holder of the positions of the person who left', async () => {
        const clearHolder = vi.fn().mockResolvedValue(2);
        const handler: PositionsHolderDepartureHandler = new PositionsHolderDepartureHandler({ clearHolder } as unknown as PositionDomain);

        await handler.onMemberRemoved('ana');

        expect(clearHolder).toHaveBeenCalledWith('ana');
        expect(handler.area).toBe('positions-holder');
    });
});
