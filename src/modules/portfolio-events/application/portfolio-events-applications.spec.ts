import { describe, expect, it, vi } from 'vitest';
import { QueuePublisherPort } from '../../../core/queue/queue.types';
import { HeldAssetsService } from '../../market-data/services/held-assets.service';
import { parsePortfolioEventsConfig } from '../config/portfolio-events.config';
import { AssetIssuerLinkDomain } from '../domain/asset-issuer-link.domain';
import { PortfolioEventDomain } from '../domain/portfolio-event.domain';
import { IssuerLink, PortfolioEventDraft } from '../domain/portfolio-events.types';
import { PortfolioEventSourcePort } from '../ports/portfolio-event-source.port';
import { PortfolioEventSourceRegistryService } from '../services/portfolio-event-source-registry.service';
import { PortfolioEventsLogService } from '../services/portfolio-events-log.service';
import { PortfolioEventsMetricsService } from '../services/portfolio-events-metrics.service';
import { PortfolioEventsBatchApplication } from './portfolio-events-batch.application';
import { PortfolioEventsSweepApplication } from './portfolio-events-sweep.application';

const ASSET_A: string = '0199a000-0000-7000-8000-00000000000a';
const ASSET_B: string = '0199a000-0000-7000-8000-00000000000b';
const ASSET_C: string = '0199a000-0000-7000-8000-00000000000c';

const fund = (assetId: string): IssuerLink => ({ assetId, issuerKind: 'fund', cnpj: '11728688000147' });
const company = (assetId: string): IssuerLink => ({ assetId, issuerKind: 'company', cnpj: '33000167000101' });

class FakeSource extends PortfolioEventSourcePort {
    public readonly source = 'fnet' as const;
    public readonly fetchFor: ReturnType<typeof vi.fn> = vi.fn();

    public handles(link: IssuerLink): boolean {
        return link.issuerKind === 'fund';
    }
}

const draft: PortfolioEventDraft = {
    kind: 'fii_income',
    exDate: '2026-10-30',
    paymentDate: '2026-11-14',
    eventDate: null,
    amountPerUnit: '1.10',
    currency: 'BRL',
    externalKey: '11728688000147:fii_income:2026-10-30',
    documentUrl: null
};

function logsAndMetrics() {
    const logFns = {
        sweepFinished: vi.fn(),
        batchFinished: vi.fn(),
        sourceFailed: vi.fn(),
        invalidPayload: vi.fn(),
        sourceUnavailable: vi.fn()
    };
    const metricFns = { fetched: vi.fn(), unlinkedAssets: vi.fn(), sourceFailed: vi.fn() };
    return {
        logFns,
        metricFns,
        logs: logFns as unknown as PortfolioEventsLogService,
        metrics: metricFns as unknown as PortfolioEventsMetricsService
    };
}

function sweepWith(source: FakeSource | null, held: string[], linked: IssuerLink[]) {
    const publish: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const findByAssetIds: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(linked);
    const { logs, metrics, metricFns } = logsAndMetrics();
    const application: PortfolioEventsSweepApplication = new PortfolioEventsSweepApplication(
        parsePortfolioEventsConfig({ PORTFOLIO_EVENTS_BATCH_SIZE: '2', PORTFOLIO_EVENTS_BATCH_SPACING_MS: '1000' }),
        { listHeldAssetIds: vi.fn().mockResolvedValue(held) } as unknown as HeldAssetsService,
        { findByAssetIds } as unknown as AssetIssuerLinkDomain,
        { enabled: () => (source === null ? [] : [source]) } as unknown as PortfolioEventSourceRegistryService,
        { publish } as unknown as QueuePublisherPort,
        metrics,
        logs
    );
    return { application, publish, findByAssetIds, metricFns };
}

describe('PortfolioEventsSweepApplication', () => {
    it('looks up only the held assets and batches the ones the source handles', async () => {
        const { application, publish, findByAssetIds, metricFns } = sweepWith(
            new FakeSource(),
            [ASSET_A, ASSET_B, ASSET_C, 'no-link'],
            [fund(ASSET_C), fund(ASSET_A), company(ASSET_B)]
        );

        const jobs: number = await application.handleTick();

        expect(findByAssetIds).toHaveBeenCalledWith([ASSET_A, ASSET_B, ASSET_C, 'no-link']);
        expect(jobs).toBe(1);
        expect(publish.mock.calls[0]?.[2]).toEqual({ source: 'fnet', assetIds: [ASSET_A, ASSET_C] });
        expect(metricFns.unlinkedAssets).toHaveBeenCalledWith(1);
    });

    it('splits into batches with growing delay and the same job ids when run twice on the same day', async () => {
        const links: IssuerLink[] = [ASSET_A, ASSET_B, ASSET_C].map(fund);
        const first = sweepWith(new FakeSource(), [ASSET_A, ASSET_B, ASSET_C], links);
        const second = sweepWith(new FakeSource(), [ASSET_A, ASSET_B, ASSET_C], links);

        await first.application.handleTick();
        await second.application.handleTick();

        const options = first.publish.mock.calls.map((call: unknown[]) => call[3] as { jobId: string; delayMs: number });
        expect(options.map((option) => option.delayMs)).toEqual([0, 1000]);
        expect(second.publish.mock.calls.map((call: unknown[]) => (call[3] as { jobId: string }).jobId)).toEqual(
            options.map((option) => option.jobId)
        );
    });

    it('publishes nothing when no source is enabled', async () => {
        const { application, publish } = sweepWith(null, [ASSET_A], [fund(ASSET_A)]);

        expect(await application.handleTick()).toBe(0);
        expect(publish).not.toHaveBeenCalled();
    });

    it('queries nothing for an asset nobody holds', async () => {
        const { application, publish, findByAssetIds } = sweepWith(new FakeSource(), [], []);

        await application.handleTick();

        expect(findByAssetIds).toHaveBeenCalledWith([]);
        expect(publish).not.toHaveBeenCalled();
    });
});

function batchWith(source: FakeSource | null, linked: IssuerLink[]) {
    const saveMany: ReturnType<typeof vi.fn> = vi.fn().mockImplementation((events: unknown[]) => Promise.resolve(events.length));
    const { logs, metrics, logFns, metricFns } = logsAndMetrics();
    const application: PortfolioEventsBatchApplication = new PortfolioEventsBatchApplication(
        { findByAssetIds: vi.fn().mockResolvedValue(linked) } as unknown as AssetIssuerLinkDomain,
        { saveMany } as unknown as PortfolioEventDomain,
        { find: () => source } as unknown as PortfolioEventSourceRegistryService,
        metrics,
        logs
    );
    return { application, saveMany, logFns, metricFns };
}

describe('PortfolioEventsBatchApplication', () => {
    it('stores the events of each asset and counts them by source and kind', async () => {
        const source: FakeSource = new FakeSource();
        source.fetchFor.mockResolvedValue([draft]);
        const { application, saveMany, metricFns } = batchWith(source, [fund(ASSET_A), company(ASSET_B)]);

        const outcome = await application.handleBatch({ source: 'fnet', assetIds: [ASSET_A, ASSET_B] });

        expect(outcome).toEqual({ events: 1, failed: 0 });
        expect(source.fetchFor).toHaveBeenCalledTimes(1);
        expect(saveMany).toHaveBeenCalledWith([{ ...draft, assetId: ASSET_A, source: 'fnet' }]);
        expect(metricFns.fetched).toHaveBeenCalledWith('fnet', 'fii_income', 1);
    });

    it('one failing fund does not stop the others and the failure is recorded', async () => {
        const source: FakeSource = new FakeSource();
        source.fetchFor.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([draft]);
        const { application, metricFns, logFns } = batchWith(source, [fund(ASSET_A), fund(ASSET_B)]);

        const outcome = await application.handleBatch({ source: 'fnet', assetIds: [ASSET_A, ASSET_B] });

        expect(outcome).toEqual({ events: 1, failed: 1 });
        expect(metricFns.sourceFailed).toHaveBeenCalledWith('fnet', 'unexpected');
        expect(logFns.sourceFailed).toHaveBeenCalledWith('fnet', 'unexpected');
    });

    it('ignores an invalid payload and a source that is switched off', async () => {
        const off = batchWith(null, []);
        const invalid = batchWith(new FakeSource(), []);

        expect(await off.application.handleBatch({ source: 'fnet', assetIds: [ASSET_A] })).toBeNull();
        expect(await invalid.application.handleBatch({ source: 'nope' })).toBeNull();
        expect(off.logFns.sourceUnavailable).toHaveBeenCalledWith('fnet');
        expect(invalid.logFns.invalidPayload).toHaveBeenCalled();
    });
});
