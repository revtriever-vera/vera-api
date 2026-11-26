import { describe, expect, it, vi } from 'vitest';
import { PortfolioWatchPublisherService, monthlySnapshotJobId } from './portfolio-watch-publisher.service';

describe('PortfolioWatchPublisherService', () => {
    it('o jobId não tem dois pontos e muda por empresa e por mês', () => {
        expect(monthlySnapshotJobId('c1', '2026-12')).toBe('portfolio-watch-snapshot-c1-2026-12');
        expect(monthlySnapshotJobId('c1', '2026-12')).not.toContain(':');
    });

    it('publica o pedido de foto com o jobId determinístico', async () => {
        const publish = vi.fn().mockResolvedValue(undefined);

        await new PortfolioWatchPublisherService({ publish, remove: vi.fn() }).requestMonthlySnapshot('c1', '2026-12');

        expect(publish).toHaveBeenCalledWith(
            'vera-portfolio-watch',
            'portfolio-watch.monthly-snapshot.company.requested',
            { companyId: 'c1' },
            { jobId: 'portfolio-watch-snapshot-c1-2026-12', replaceExisting: true }
        );
    });
});
