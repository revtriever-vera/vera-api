import { describe, expect, it, vi } from 'vitest';
import { CutsApplication } from '../../application/cuts.application';
import { CutsController } from './cuts.controller';

describe('CutsController', () => {
    it('repassa mês e meta simulada para a application', async () => {
        const get = vi.fn().mockResolvedValue({ status: 'goal_met' });

        const result = await new CutsController({ get } as unknown as CutsApplication).get({ month: '2026-09', goalBps: 3500 });

        expect(get).toHaveBeenCalledWith('2026-09', 3500);
        expect(result).toEqual({ status: 'goal_met' });
    });
});
