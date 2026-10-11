import { describe, expect, it, vi } from 'vitest';
import { LogService } from '../../../core/observability/log.service';
import { SpendingSummaryLogService } from './spending-summary-log.service';

describe('SpendingSummaryLogService', () => {
    it('o resumo sai em debug só com contagens e duração', () => {
        const debug = vi.fn();

        new SpendingSummaryLogService({ debug } as unknown as LogService).summaryBuilt('2026-09', false, 9, 12);

        expect(debug).toHaveBeenCalledWith({
            message: 'spending summary built',
            identifier: 'spending-summary',
            meta: { month: '2026-09', isPartial: false, categories: 9, durationMs: 12 }
        });
    });

    it('a mudança de preferências registra só o modo de renda', () => {
        const info = vi.fn();

        new SpendingSummaryLogService({ info } as unknown as LogService).settingsUpdated('declared');

        expect(info).toHaveBeenCalledWith({
            message: 'spending settings updated',
            identifier: 'spending-settings',
            meta: { action: 'updated', incomeMode: 'declared' }
        });
    });
});
