import { describe, expect, it, vi } from 'vitest';
import { SpendingSummaryService } from '../../spending-summary/services/spending-summary.service';
import { SpendingCutsLogService } from '../services/spending-cuts-log.service';
import { SpendingCutsMetricsService } from '../services/spending-cuts-metrics.service';
import { CutsApplication } from './cuts.application';

function build(summary: object) {
    const buildSummary = vi.fn().mockResolvedValue(summary);
    const cutsBuilt = vi.fn();
    const cuts = vi.fn();
    const application: CutsApplication = new CutsApplication(
        { build: buildSummary } as unknown as SpendingSummaryService,
        { cutsBuilt } as unknown as SpendingCutsLogService,
        { cuts } as unknown as SpendingCutsMetricsService
    );
    return { application, buildSummary, cutsBuilt, cuts };
}

const EMPTY_SUMMARY = {
    month: '2026-09',
    isPartial: false,
    hasData: false,
    income: { minor: 0 },
    savedMinor: 0,
    savingsRateBps: null,
    goal: { bps: 2000, minor: 0 },
    gapMinor: 0,
    uncategorizedMinor: 0,
    averageMonths: 0,
    categories: []
};

describe('CutsApplication', () => {
    it('sem mês pede o padrão ao resumo e registra o status', async () => {
        const { application, buildSummary, cutsBuilt, cuts } = build(EMPTY_SUMMARY);

        const result = await application.get(undefined, undefined);

        expect(buildSummary).toHaveBeenCalledWith(null);
        expect(result.status).toBe('no_data');
        expect(cuts).toHaveBeenCalledWith('no_data');
        expect(cutsBuilt).toHaveBeenCalledWith('2026-09', 'no_data', 0, false);
    });

    it('repassa o mês e marca a simulação no log', async () => {
        const { application, buildSummary, cutsBuilt } = build(EMPTY_SUMMARY);

        await application.get('2026-08', 3500);

        expect(buildSummary).toHaveBeenCalledWith('2026-08');
        expect(cutsBuilt).toHaveBeenCalledWith('2026-09', 'no_data', 0, true);
    });
});
