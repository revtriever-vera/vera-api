import { describe, expect, it, vi } from 'vitest';
import { LogService } from '../../../core/observability/log.service';
import { TransactionsExportLogService } from './transactions-export-log.service';

describe('TransactionsExportLogService', () => {
    it('logs format, rows, duration and size and never content', () => {
        const info = vi.fn();
        const warn = vi.fn();
        const service: TransactionsExportLogService = new TransactionsExportLogService({ info, warn } as unknown as LogService);

        service.exported('csv', 29, 12, 4096);
        service.refused('xlsx', 60_000);

        expect(info).toHaveBeenCalledWith({
            message: 'transactions exported',
            identifier: 'transactions-export',
            meta: { format: 'csv', rows: 29, durationMs: 12, sizeBytes: 4096 }
        });
        expect(warn).toHaveBeenCalledWith({
            message: 'transactions export refused',
            identifier: 'transactions-export',
            meta: { format: 'xlsx', rows: 60_000 }
        });
    });
});
