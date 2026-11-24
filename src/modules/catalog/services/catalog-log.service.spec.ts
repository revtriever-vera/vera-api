import { describe, expect, it, vi } from 'vitest';
import { LogService } from '../../../core/observability/log.service';
import { CatalogLogService } from './catalog-log.service';

function rig(): {
    service: CatalogLogService;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
} {
    const info: ReturnType<typeof vi.fn> = vi.fn();
    const warn: ReturnType<typeof vi.fn> = vi.fn();
    const error: ReturnType<typeof vi.fn> = vi.fn();
    return { service: new CatalogLogService({ info, warn, error } as unknown as LogService), info, warn, error };
}

describe('CatalogLogService', () => {
    it('logs a finished round with the counts and the status', () => {
        const { service, info } = rig();

        service.syncFinished('b3', { status: 'succeeded', fetched: 5, upserted: 2, delisted: 1, errorCode: null });

        expect(info).toHaveBeenCalledWith({
            message: 'sync finished',
            identifier: 'catalog-sync',
            meta: { source: 'b3', fetched: 5, upserted: 2, delisted: 1, status: 'succeeded' }
        });
    });

    it('logs the daily informe read with the month and the counts but no content', () => {
        const { service, info } = rig();

        service.informeRead('202611', true, 0, 12);

        expect(info).toHaveBeenCalledWith({
            message: 'daily informe read',
            identifier: 'catalog-source',
            meta: { source: 'cvm_funds', month: '202611', notModified: true, rows: 0, durationMs: 12 }
        });
    });

    it('logs the fund catalog counts under the CVM funds source', () => {
        const { service, info } = rig();
        const counts = { classesRead: 10, classesFiltered: 5, seriesWithQuota: 4, seriesWritten: 3, seriesWithoutQuota: 2 };

        service.fundCatalogBuilt(counts);

        expect(info).toHaveBeenCalledWith({
            message: 'fund catalog built',
            identifier: 'catalog-source',
            meta: { source: 'cvm_funds', ...counts }
        });
    });

    it('logs a suspicious round as a warning', () => {
        const { service, warn } = rig();

        service.syncSuspicious('us', 10, 100);

        expect(warn).toHaveBeenCalledWith(
            expect.objectContaining({ identifier: 'catalog-sync', meta: { source: 'us', fetched: 10, previous: 100 } })
        );
    });

    it('logs a provider failure under catalog-source with the error code only', () => {
        const { service, error } = rig();

        service.sourceFailed('crypto', 'catalog.source_rate_limited');

        expect(error).toHaveBeenCalledWith({
            message: 'source failed',
            identifier: 'catalog-source',
            meta: { source: 'crypto', errorCode: 'catalog.source_rate_limited' }
        });
    });

    it('logs search errors under catalog-search', () => {
        const { service, error } = rig();
        const failure: Error = new Error('x');

        service.searchFailed(failure);

        expect(error).toHaveBeenCalledWith({ message: 'search failed', identifier: 'catalog-search', error: failure });
    });

    it('logs skipped sources and invalid payloads', () => {
        const { service, info, error } = rig();

        service.syncSkippedWithoutDriver('us');
        service.invalidPayload('catalog.sync.tick.requested');

        expect(info).toHaveBeenCalledWith(expect.objectContaining({ message: 'sync skipped without driver' }));
        expect(error).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'invalid payload', meta: { type: 'catalog.sync.tick.requested' } })
        );
    });
});
