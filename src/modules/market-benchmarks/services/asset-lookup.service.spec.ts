import { describe, expect, it, vi } from 'vitest';
import { AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { QuoteReaderService } from '../../market-data/services/quote-reader.service';
import { AssetLookupService } from './asset-lookup.service';

const ASSET = {
    id: 'a1',
    symbol: 'PETR4',
    name: 'Petrobras PN',
    market: 'B3',
    kind: 'stock',
    typeGroup: 'acoes_br',
    suggestedClassKey: 'acoes_br',
    currency: 'BRL'
};

describe('AssetLookupService', () => {
    it('pesquisa até 3 ativos e junta a última cotação de cada um', async () => {
        const searchAny = vi.fn().mockResolvedValue([ASSET, { ...ASSET, id: 'a2', symbol: 'PETR3' }]);
        const getLatest = vi
            .fn()
            .mockResolvedValue(
                new Map([
                    ['a1', { assetId: 'a1', price: '38.52', currency: 'BRL', priceDate: '2026-03-19', source: 'brapi', stale: false }]
                ])
            );
        const service = new AssetLookupService(
            { searchAny } as unknown as AssetCatalogService,
            { getLatest } as unknown as QuoteReaderService
        );

        const found = await service.lookup('petrobras');

        expect(searchAny).toHaveBeenCalledWith('petrobras', 3);
        expect(getLatest).toHaveBeenCalledWith(['a1', 'a2']);
        expect(found[0]).toMatchObject({ symbol: 'PETR4', quote: { price: '38.52', currency: 'BRL', date: '2026-03-19', stale: false } });
        expect(found[1]).toMatchObject({ symbol: 'PETR3', quote: null });
    });

    it('sem resultado não consulta cotação', async () => {
        const getLatest = vi.fn();
        const service = new AssetLookupService(
            { searchAny: vi.fn().mockResolvedValue([]) } as unknown as AssetCatalogService,
            { getLatest } as unknown as QuoteReaderService
        );

        expect(await service.lookup('nada')).toEqual([]);
        expect(getLatest).not.toHaveBeenCalled();
    });
});
