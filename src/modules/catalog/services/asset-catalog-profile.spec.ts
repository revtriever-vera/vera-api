import { describe, expect, it } from 'vitest';
import { AssetDomain } from '../domain/asset.domain';
import { AssetCatalogService } from './asset-catalog.service';

describe('AssetCatalogService.profileOf', () => {
    it('reads the curated profile of the asset by market and symbol', () => {
        const service: AssetCatalogService = new AssetCatalogService({} as unknown as AssetDomain);

        expect(service.profileOf({ market: 'B3', symbol: 'PETR4' })).toEqual({ sector: 'petroleo_gas', issuerGroupId: 'petrobras' });
        expect(service.profileOf({ market: 'B3', symbol: 'NOPE3' })).toEqual({ sector: null, issuerGroupId: null });
    });
});
