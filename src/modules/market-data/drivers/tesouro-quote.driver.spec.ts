import { describe, expect, it, vi } from 'vitest';
import { TesouroBond, TesouroCsvReaderService } from '../../catalog/services/tesouro-csv-reader.service';
import { asset } from './driver-test-support';
import { TesouroQuoteDriver } from './tesouro-quote.driver';

function bond(typeName: string, maturityDate: string, sell: string | null, base: string | null): TesouroBond {
    return { typeName, maturityDate, baseDate: '2026-10-08', baseUnitPrice: base, buyUnitPrice: null, sellUnitPrice: sell };
}

function driverWith(read: ReturnType<typeof vi.fn>): TesouroQuoteDriver {
    return new TesouroQuoteDriver({ readLatest: read } as unknown as TesouroCsvReaderService);
}

describe('TesouroQuoteDriver', () => {
    it('prices a bond by its redemption price and falls back to the base price', async () => {
        const read: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({
            changed: true,
            baseDate: '2026-10-08',
            bonds: [bond('Tesouro Selic', '2029-03-01', '15230.10', '15232.00'), bond('Tesouro IPCA+', '2035-05-15', null, '2095.30')]
        });

        const result = await driverWith(read).fetchBatch([
            asset('selic:2029-03-01', 'TESOURO'),
            asset('ipca:2035-05-15', 'TESOURO'),
            asset('selic:2031-03-01', 'TESOURO')
        ]);

        expect(read).toHaveBeenCalledWith({ ignoreCache: true });
        expect(result.quotes).toEqual([
            { assetId: 'id-selic:2029-03-01', price: '15230.10', currency: 'BRL', priceDate: '2026-10-08', source: 'tesouro' },
            { assetId: 'id-ipca:2035-05-15', price: '2095.30', currency: 'BRL', priceDate: '2026-10-08', source: 'tesouro' }
        ]);
        expect(result.failures).toEqual([{ assetId: 'id-selic:2031-03-01', stage: 'not_found', reason: 'market-data.symbol_unknown' }]);
    });

    it('returns nothing when the file did not change', async () => {
        const result = await driverWith(vi.fn().mockResolvedValue({ changed: false })).fetchBatch([asset('selic:2029-03-01', 'TESOURO')]);

        expect(result).toEqual({ quotes: [], failures: [] });
    });

    it('turns a read error into request failures', async () => {
        const result = await driverWith(vi.fn().mockRejectedValue(new Error('boom'))).fetchBatch([asset('selic:2029-03-01', 'TESOURO')]);

        expect(result.failures).toEqual([{ assetId: 'id-selic:2029-03-01', stage: 'request', reason: 'market-data.unexpected' }]);
    });
});
