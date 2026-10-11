import { describe, expect, it, vi } from 'vitest';
import { LogService } from '../../../core/observability/log.service';
import { MetricsService } from '../../../core/observability/metrics.service';
import { MarketDataLogService } from './market-data-log.service';
import { MarketDataMetricsService } from './market-data-metrics.service';

describe('MarketDataLogService', () => {
    it('logs with the card identifiers and only safe fields', () => {
        const info: ReturnType<typeof vi.fn> = vi.fn();
        const warn: ReturnType<typeof vi.fn> = vi.fn();
        const error: ReturnType<typeof vi.fn> = vi.fn();
        const logs: MarketDataLogService = new MarketDataLogService({ info, warn, error } as unknown as LogService);

        logs.sweepFinished(6, 3);
        logs.chunkFinished('brapi', 2, 1, 1);
        logs.providerFailed('finnhub', 'request', 'market-data.provider_unavailable');
        logs.rateStored('USD', '2026-10-09', 'bcb-ptax');
        logs.budgetRefused('coingecko', 1);
        logs.groupWithoutProvider('brapi');
        logs.rateMissing('USD');
        logs.rateFailed('USD', new Error('x'));
        logs.invalidPayload('t');

        const identifiers: string[] = [...info.mock.calls, ...warn.mock.calls, ...error.mock.calls].map(
            (call: unknown[]) => (call[0] as { identifier: string }).identifier
        );
        expect(new Set(identifiers)).toEqual(
            new Set(['market-data-sweep', 'market-data-chunk', 'market-data-provider', 'market-data-fx', 'market-data-budget'])
        );
        expect(info).toHaveBeenCalledWith(expect.objectContaining({ meta: { held: 6, chunks: 3 } }));
        expect(info).toHaveBeenCalledWith(expect.objectContaining({ meta: { provider: 'brapi', requested: 2, stored: 1, failed: 1 } }));
    });
});

describe('MarketDataMetricsService', () => {
    it('emits the metrics named in the card', () => {
        const count: ReturnType<typeof vi.fn> = vi.fn();
        const gauge: ReturnType<typeof vi.fn> = vi.fn();
        const metrics: MarketDataMetricsService = new MarketDataMetricsService({ count, gauge } as unknown as MetricsService);

        metrics.fetched('brapi', 'ok', 2);
        metrics.fetched('brapi', 'failed', 0);
        metrics.staleAssets(4);
        metrics.budgetUsed('finnhub', 'minute', 0.5);
        metrics.rateAge('USD', 3);

        expect(count).toHaveBeenCalledTimes(1);
        expect(count).toHaveBeenCalledWith('vera_quotes_fetch_total', { provider: 'brapi', result: 'ok' }, 2);
        expect(gauge).toHaveBeenCalledWith('vera_quotes_stale_assets', 4);
        expect(gauge).toHaveBeenCalledWith('vera_provider_budget_used_ratio', 0.5, { provider: 'finnhub', window: 'minute' });
        expect(gauge).toHaveBeenCalledWith('vera_exchange_rate_age_days', 3, { currency: 'USD' });
    });
});
