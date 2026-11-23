import { describe, expect, it } from 'vitest';
import type { MonthlySummary } from '../../spending-summary/services/spending-summary.service';
import { SpendingCutsService } from './spending-cuts.service';

describe('SpendingCutsService', () => {
    it('calcula os cortes pelo mesmo cálculo da rota, sem dados', () => {
        const summary = {
            month: '2026-09',
            isPartial: false,
            hasData: false,
            income: { minor: 0 },
            goal: { bps: 2000, minor: 0 },
            gapMinor: 0,
            savedMinor: 0,
            savingsRateBps: null,
            uncategorizedMinor: 0,
            averageMonths: 0,
            categories: []
        } as unknown as MonthlySummary;

        expect(new SpendingCutsService().compute(summary, undefined).status).toBe('no_data');
    });
});
