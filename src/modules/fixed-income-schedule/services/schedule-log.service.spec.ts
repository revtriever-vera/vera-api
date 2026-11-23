import { describe, expect, it, vi } from 'vitest';
import { LogService } from '../../../core/observability/log.service';
import { ScheduleLogService } from './schedule-log.service';

describe('ScheduleLogService', () => {
    it('avisa a falta de série só com a rota e quais séries faltam', () => {
        const warn = vi.fn();
        const service = new ScheduleLogService({ warn } as unknown as LogService);

        service.referenceMissing('maturities', true, false);

        expect(warn).toHaveBeenCalledWith({
            message: 'reference rates missing, rows are estimated',
            identifier: 'fixed-income-schedule',
            meta: { endpoint: 'maturities', cdiMissing: true, ipcaMissing: false }
        });
    });
});
