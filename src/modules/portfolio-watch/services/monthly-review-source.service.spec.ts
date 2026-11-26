import { describe, expect, it, vi } from 'vitest';
import { MonthlyReviewDomain } from '../domain/monthly-review.domain';
import { MonthlyReviewNarrativeService } from './monthly-review-narrative.service';
import { MonthlyReviewSourceService } from './monthly-review-source.service';

const PAYLOAD = {
    month: '2026-10',
    baseCurrency: 'BRL',
    byClass: [],
    benchmarks: {
        cdi: { state: 'ok', returnPct: 1, referenceMonth: '2026-10' },
        ipca: { state: 'no_data', returnPct: null, referenceMonth: null },
        ibovespa: { state: 'not_configured', returnPct: null, referenceMonth: null }
    },
    topGainers: [],
    topLosers: [],
    income: { amountMinor: 0, source: 'ledger' },
    concentration: { topIssuers: [], sectors: [], fgcExposure: { overLimitMinor: 0, groups: [] } },
    coverage: { reason: null, message: null, generatedAt: '2026-11-01T08:00:00.000Z' }
};

describe('MonthlyReviewSourceService', () => {
    it('entrega a revisão guardada do mês com os nomes das classes, e nulo sem revisão', async () => {
        const find = vi.fn().mockResolvedValueOnce({ payload: PAYLOAD }).mockResolvedValueOnce(null);
        const labels = vi.fn().mockResolvedValue([{ classId: 'c1', systemKey: null, displayName: 'X' }]);
        const service: MonthlyReviewSourceService = new MonthlyReviewSourceService(
            { find } as unknown as MonthlyReviewDomain,
            { labels } as unknown as MonthlyReviewNarrativeService
        );

        expect(await service.of('2026-10')).toEqual({ review: PAYLOAD, labels: [{ classId: 'c1', systemKey: null, displayName: 'X' }] });
        expect(await service.of('2026-09')).toBeNull();
    });
});
