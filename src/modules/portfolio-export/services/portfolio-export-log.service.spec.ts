import { describe, expect, it, vi } from 'vitest';
import { LogService } from '../../../core/observability/log.service';
import { PortfolioExportLogService } from './portfolio-export-log.service';

describe('PortfolioExportLogService', () => {
    it('logs the export with format, rows and duration, never the content', () => {
        const info = vi.fn();
        const service: PortfolioExportLogService = new PortfolioExportLogService({ info } as unknown as LogService);

        service.exported('csv', 12, 34);

        expect(info).toHaveBeenCalledWith({
            message: 'portfolio exported',
            identifier: 'portfolio-export',
            meta: { format: 'csv', rows: 12, durationMs: 34 }
        });
    });
});
