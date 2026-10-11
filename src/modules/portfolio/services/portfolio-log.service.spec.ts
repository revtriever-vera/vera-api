import { describe, expect, it, vi } from 'vitest';
import { LogService } from '../../../core/observability/log.service';
import { PortfolioLogService } from './portfolio-log.service';

describe('PortfolioLogService', () => {
    it('logs the snapshot at info level with the identifier', () => {
        const info = vi.fn();
        const service: PortfolioLogService = new PortfolioLogService({ info } as unknown as LogService);

        service.snapshot({ holdings: 3, classes: 8, missingQuotes: 0, staleQuotes: 1, durationMs: 12 });

        expect(info).toHaveBeenCalledWith({
            message: 'portfolio snapshot built',
            identifier: 'portfolio-snapshot',
            meta: { holdings: 3, classes: 8, missingQuotes: 0, staleQuotes: 1, durationMs: 12 }
        });
    });

    it('logs an orphan holding at error level', () => {
        const error = vi.fn();
        const service: PortfolioLogService = new PortfolioLogService({ error } as unknown as LogService);

        service.orphanHolding('position', 'p-1');

        expect(error).toHaveBeenCalledWith({
            message: 'holding without class assignment',
            identifier: 'portfolio-orphan-holding',
            meta: { subjectType: 'position', subjectId: 'p-1' }
        });
    });
});
