import { describe, expect, it, vi } from 'vitest';
import { TransactionalContext } from '../../../core/database/using-transaction.decorator';
import { DatabaseClient } from '../../../core/database/database.client';
import { AssetDomain } from '../domain/asset.domain';
import { CatalogSyncRunDomain } from '../domain/catalog-sync-run.domain';
import { CatalogSourceError } from '../domain/catalog.errors';
import { SyncRunOutcome } from '../domain/catalog.types';
import { AssetSourcePort, SourceAsset } from '../ports/asset-source.port';
import { AssetSourceRegistryService } from '../services/asset-source-registry.service';
import { CatalogLogService } from '../services/catalog-log.service';
import { CatalogMetricsService } from '../services/catalog-metrics.service';
import { CatalogSyncApplication } from './catalog-sync.application';

TransactionalContext.set({ withTransaction: async (fn: () => Promise<unknown>) => fn() } as unknown as DatabaseClient);

function asset(symbol: string, kind: SourceAsset['kind'] = 'stock'): SourceAsset {
    return { externalId: symbol, symbol, name: symbol, kind, currency: 'BRL', raw: {} };
}

function stocks(count: number): SourceAsset[] {
    return Array.from({ length: count }, (_unused: unknown, index: number) => asset(`AAA${String(index)}`));
}

interface Rig {
    readonly application: CatalogSyncApplication;
    readonly applySnapshot: ReturnType<typeof vi.fn>;
    readonly finish: ReturnType<typeof vi.fn>;
    readonly publish: ReturnType<typeof vi.fn>;
    readonly syncResult: ReturnType<typeof vi.fn>;
    readonly sourceFailed: ReturnType<typeof vi.fn>;
    readonly suspicious: ReturnType<typeof vi.fn>;
}

function rig(options: { fetchAll?: () => Promise<readonly SourceAsset[]>; previous?: number | null; sources?: string[] } = {}): Rig {
    const applySnapshot: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ upserted: 2, delisted: 1 });
    const finish: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const publish: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const syncResult: ReturnType<typeof vi.fn> = vi.fn();
    const sourceFailed: ReturnType<typeof vi.fn> = vi.fn();
    const suspicious: ReturnType<typeof vi.fn> = vi.fn();
    const port: AssetSourcePort = {
        source: 'b3',
        fetchAll: options.fetchAll ?? (async () => Promise.resolve([asset('ITUB4'), asset('WEGE3')]))
    };
    const available: string[] = options.sources ?? ['b3', 'tesouro'];
    const registry: AssetSourceRegistryService = {
        portFor: (source: string) => (source === 'b3' ? port : null),
        available: () => available
    } as unknown as AssetSourceRegistryService;
    const application: CatalogSyncApplication = new CatalogSyncApplication(
        { applySnapshot, countByStatus: vi.fn().mockResolvedValue([{ status: 'active', total: 2 }]) } as unknown as AssetDomain,
        {
            start: vi.fn().mockResolvedValue({ id: 'run-1' }),
            finish,
            lastSucceededFetched: vi.fn().mockResolvedValue(options.previous === undefined ? null : options.previous)
        } as unknown as CatalogSyncRunDomain,
        registry,
        { publish },
        {
            syncFinished: vi.fn(),
            syncSuspicious: suspicious,
            syncSkippedWithoutDriver: vi.fn(),
            sourceFailed,
            invalidPayload: vi.fn()
        } as unknown as CatalogLogService,
        { syncResult, assetCounts: vi.fn() } as unknown as CatalogMetricsService
    );
    return { application, applySnapshot, finish, publish, syncResult, sourceFailed, suspicious };
}

describe('CatalogSyncApplication.runSource', () => {
    it('persists the classified snapshot and records a succeeded run', async () => {
        const { application, applySnapshot, finish, syncResult } = rig();

        const outcome: SyncRunOutcome | null = await application.runSource('b3');

        expect(outcome).toEqual({ status: 'succeeded', fetched: 2, upserted: 2, delisted: 1, errorCode: null });
        expect(applySnapshot).toHaveBeenCalledWith(
            'B3',
            expect.arrayContaining([expect.objectContaining({ externalId: 'ITUB4', typeGroup: 'acoes_br' })]),
            expect.any(Date)
        );
        expect(finish).toHaveBeenCalledWith('run-1', outcome);
        expect(syncResult).toHaveBeenCalledWith('b3', 'succeeded');
    });

    it('leaves out the assets the classification drops', async () => {
        const { application, applySnapshot } = rig({ fetchAll: async () => Promise.resolve([asset('ITUB4'), asset('XXXX1', 'crypto')]) });

        await application.runSource('b3');

        const writes: { externalId: string }[] = applySnapshot.mock.calls[0]?.[1] as { externalId: string }[];
        expect(writes.map((write: { externalId: string }) => write.externalId)).toEqual(['ITUB4']);
    });

    it('records skipped_suspicious and writes nothing when the count falls under 80% of the previous run', async () => {
        const { application, applySnapshot, finish, suspicious } = rig({ previous: 10 });

        const outcome: SyncRunOutcome | null = await application.runSource('b3');

        expect(outcome).toEqual({ status: 'skipped_suspicious', fetched: 2, upserted: 0, delisted: 0, errorCode: null });
        expect(applySnapshot).not.toHaveBeenCalled();
        expect(finish).toHaveBeenCalledWith('run-1', outcome);
        expect(suspicious).toHaveBeenCalledWith('b3', 2, 10);
    });

    it('accepts a count at exactly 80% of the previous run', async () => {
        const { application, applySnapshot } = rig({ fetchAll: async () => Promise.resolve(stocks(8)), previous: 10 });

        const outcome: SyncRunOutcome | null = await application.runSource('b3');

        expect(outcome?.status).toBe('succeeded');
        expect(applySnapshot).toHaveBeenCalled();
    });

    it('fails the run without retry when the source answers an unusable format', async () => {
        const { application, finish, sourceFailed, syncResult } = rig({
            fetchAll: async () => Promise.reject(new CatalogSourceError('catalog.source_format_invalid'))
        });

        const outcome: SyncRunOutcome | null = await application.runSource('b3');

        expect(outcome).toEqual({ status: 'failed', fetched: 0, upserted: 0, delisted: 0, errorCode: 'catalog.source_format_invalid' });
        expect(finish).toHaveBeenCalledWith('run-1', outcome);
        expect(sourceFailed).toHaveBeenCalledWith('b3', 'catalog.source_format_invalid');
        expect(syncResult).toHaveBeenCalledWith('b3', 'failed');
    });

    it('records the failure and rethrows when the provider error is worth retrying', async () => {
        const { application, finish } = rig({ fetchAll: async () => Promise.reject(new CatalogSourceError('catalog.source_unavailable')) });

        await expect(application.runSource('b3')).rejects.toBeInstanceOf(CatalogSourceError);

        expect(finish).toHaveBeenCalledWith(
            'run-1',
            expect.objectContaining({ status: 'failed', errorCode: 'catalog.source_unavailable' })
        );
    });

    it('records an unexpected error under a neutral code and rethrows', async () => {
        const { application, finish } = rig({ fetchAll: async () => Promise.reject(new Error('detalhe interno do provedor')) });

        await expect(application.runSource('b3')).rejects.toThrow('detalhe interno do provedor');

        expect(finish).toHaveBeenCalledWith('run-1', expect.objectContaining({ errorCode: 'catalog.sync_unexpected' }));
    });

    it('fails with a format error when the source returns nothing usable on a first run', async () => {
        const { application } = rig({ fetchAll: async () => Promise.resolve([]) });

        const outcome: SyncRunOutcome | null = await application.runSource('b3');

        expect(outcome?.errorCode).toBe('catalog.source_format_invalid');
    });

    it('does nothing for a source without a registered driver', async () => {
        const { application, finish } = rig();

        expect(await application.runSource('us')).toBeNull();
        expect(finish).not.toHaveBeenCalled();
    });
});

describe('CatalogSyncApplication.fanOut', () => {
    it('publishes one job per available source of the cadence with a deterministic job id', async () => {
        const { application, publish } = rig({ sources: ['b3', 'us', 'crypto', 'tesouro'] });

        const published: string[] = await application.fanOut('weekly');

        expect(published).toEqual(['b3', 'us', 'crypto']);
        const jobIds: string[] = publish.mock.calls.map((call: unknown[]) => (call[3] as { jobId: string }).jobId);
        expect(jobIds).toEqual([
            expect.stringMatching(/^catalog-sync-b3-\d{4}-\d{2}-\d{2}$/),
            expect.stringMatching(/^catalog-sync-us-\d{4}-\d{2}-\d{2}$/),
            expect.stringMatching(/^catalog-sync-crypto-\d{4}-\d{2}-\d{2}$/)
        ]);
        expect(publish.mock.calls[0]).toEqual(['vera-catalog', 'catalog.sync.source.requested', { source: 'b3' }, expect.anything()]);
    });

    it('covers only Tesouro on the daily cadence and every source without a cadence', async () => {
        const { application } = rig({ sources: ['b3', 'us', 'crypto', 'tesouro'] });

        expect(await application.fanOut('tesouro_daily')).toEqual(['tesouro']);
        expect(await application.fanOut()).toEqual(['b3', 'us', 'crypto', 'tesouro']);
    });

    it('skips sources without a driver', async () => {
        const { application, publish } = rig({ sources: ['tesouro'] });

        expect(await application.fanOut('weekly')).toEqual([]);
        expect(publish).not.toHaveBeenCalled();
    });
});

describe('CatalogSyncApplication payload handlers', () => {
    it('ignores malformed tick and source payloads', async () => {
        const { application, publish, finish } = rig();

        await application.handleTick({ cadence: 'yearly' });
        await application.handleSource({ source: 'nasdaq' });

        expect(publish).not.toHaveBeenCalled();
        expect(finish).not.toHaveBeenCalled();
    });

    it('fans out an empty tick payload to every available source and runs a valid source payload', async () => {
        const { application, publish, finish } = rig();

        await application.handleTick({});
        await application.handleSource({ source: 'b3' });

        expect(publish).toHaveBeenCalledTimes(2);
        expect(finish).toHaveBeenCalledTimes(1);
    });
});

describe('CatalogSyncApplication.syncAllNow', () => {
    it('runs every available source', async () => {
        const { application, finish } = rig({ sources: ['b3', 'tesouro'] });

        await application.syncAllNow();

        expect(finish).toHaveBeenCalledTimes(1);
    });
});
