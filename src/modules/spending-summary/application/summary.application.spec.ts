import { describe, expect, it, vi } from 'vitest';
import { SpendingSummaryService } from '../services/spending-summary.service';
import { SummaryApplication } from './summary.application';

describe('SummaryApplication', () => {
    it('sem mês pede o padrão ao service', async () => {
        const build = vi.fn().mockResolvedValue({ month: '2026-09' });

        await new SummaryApplication({ build } as unknown as SpendingSummaryService).get(undefined);

        expect(build).toHaveBeenCalledWith(null);
    });

    it('repassa o mês pedido', async () => {
        const build = vi.fn().mockResolvedValue({ month: '2026-08' });

        await new SummaryApplication({ build } as unknown as SpendingSummaryService).get('2026-08');

        expect(build).toHaveBeenCalledWith('2026-08');
    });
});
