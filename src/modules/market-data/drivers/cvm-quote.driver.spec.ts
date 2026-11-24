import { afterEach, describe, expect, it, vi } from 'vitest';
import { CvmDailyInformeReaderService, DailyQuote } from '../../catalog/services/cvm-daily-informe-reader.service';
import { CvmQuoteDriver } from './cvm-quote.driver';
import { asset } from './driver-test-support';

function driverWith(latest: ReturnType<typeof vi.fn>): CvmQuoteDriver {
    return new CvmQuoteDriver({ latestQuotes: latest } as unknown as CvmDailyInformeReaderService);
}

function quotes(entries: [string, DailyQuote][]): ReadonlyMap<string, DailyQuote> {
    return new Map<string, DailyQuote>(entries);
}

describe('CvmQuoteDriver', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('prices each series by its own key and keeps the quota as the decimal string of the file', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
        const latest: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(
            quotes([
                ['11111111000191', { date: '2026-10-13', quota: '2.123456789012' }],
                ['22222222000191:S1', { date: '2026-10-13', quota: '10.5' }],
                ['22222222000191:S2', { date: '2026-10-12', quota: '11.75' }]
            ])
        );

        const result = await driverWith(latest).fetchBatch([
            asset('11111111000191', 'CVM'),
            asset('22222222000191:S1', 'CVM'),
            asset('22222222000191:S2', 'CVM')
        ]);

        expect(latest).toHaveBeenCalledWith(['202610'], new Set(['11111111000191', '22222222000191:S1', '22222222000191:S2']));
        expect(result.quotes).toEqual([
            { assetId: 'id-11111111000191', price: '2.123456789012', currency: 'BRL', priceDate: '2026-10-13', source: 'cvm' },
            { assetId: 'id-22222222000191:S1', price: '10.5', currency: 'BRL', priceDate: '2026-10-13', source: 'cvm' },
            { assetId: 'id-22222222000191:S2', price: '11.75', currency: 'BRL', priceDate: '2026-10-12', source: 'cvm' }
        ]);
        expect(result.failures).toEqual([]);
    });

    it('also asks for the previous month in the first business days and takes what the reader found', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-02T12:00:00Z'));
        const latest: ReturnType<typeof vi.fn> = vi
            .fn()
            .mockResolvedValue(quotes([['11111111000191', { date: '2026-09-30', quota: '3.5' }]]));

        const result = await driverWith(latest).fetchBatch([asset('11111111000191', 'CVM')]);

        expect(latest.mock.calls[0]?.[0]).toEqual(['202610', '202609']);
        expect(result.quotes[0]?.priceDate).toBe('2026-09-30');
    });

    it('reports a series missing from the file as not found', async () => {
        const result = await driverWith(vi.fn().mockResolvedValue(quotes([]))).fetchBatch([asset('33333333000191', 'CVM')]);

        expect(result.quotes).toEqual([]);
        expect(result.failures).toEqual([{ assetId: 'id-33333333000191', stage: 'not_found', reason: 'market-data.symbol_unknown' }]);
    });

    it('turns a read error into request failures for the whole batch', async () => {
        const result = await driverWith(vi.fn().mockRejectedValue(new Error('boom'))).fetchBatch([
            asset('11111111000191', 'CVM'),
            asset('22222222000191', 'CVM')
        ]);

        expect(result.quotes).toEqual([]);
        expect(result.failures.map((failure) => failure.stage)).toEqual(['request', 'request']);
    });
});
