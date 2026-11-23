import { describe, expect, it, vi } from 'vitest';
import { LogService } from '../../../core/observability/log.service';
import { MetricsService } from '../../../core/observability/metrics.service';
import { IssuersLogService } from './issuers-log.service';
import { IssuersMetricsService } from './issuers-metrics.service';

describe('IssuersLogService', () => {
    it('logs the loaded counts and the failure with the directory identifier', () => {
        const info = vi.fn();
        const error = vi.fn();
        const logs: IssuersLogService = new IssuersLogService({ info, error } as unknown as LogService);
        const boom: Error = new Error('invalid');

        logs.loaded(50, 62);
        logs.failed(boom);

        expect(info).toHaveBeenCalledWith({
            message: 'issuer directory loaded',
            identifier: 'issuers-directory',
            meta: { institutions: 50, groups: 62 }
        });
        expect(error).toHaveBeenCalledWith({ message: 'issuer directory is invalid', identifier: 'issuers-directory', error: boom });
    });
});

describe('IssuersMetricsService', () => {
    it('counts the searches by kind', () => {
        const count = vi.fn();

        new IssuersMetricsService({ count } as unknown as MetricsService).search('bank');

        expect(count).toHaveBeenCalledWith('vera_issuer_search_total', { kind: 'bank' });
    });
});
