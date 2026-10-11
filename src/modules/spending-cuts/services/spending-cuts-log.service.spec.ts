import { describe, expect, it, vi } from 'vitest';
import { LogService } from '../../../core/observability/log.service';
import { SpendingCutsLogService } from './spending-cuts-log.service';

describe('SpendingCutsLogService', () => {
    it('sai em debug só com mês, status, contagem e simulação, sem valores', () => {
        const debug = vi.fn();

        new SpendingCutsLogService({ debug } as unknown as LogService).cutsBuilt('2026-09', 'cut_suggested', 6, true);

        expect(debug).toHaveBeenCalledWith({
            message: 'spending cuts built',
            identifier: 'spending-cuts',
            meta: { month: '2026-09', status: 'cut_suggested', categoriesWithCut: 6, simulated: true }
        });
    });
});
