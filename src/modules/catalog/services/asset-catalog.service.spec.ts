import { describe, expect, it, vi } from 'vitest';
import { AssetDomain } from '../domain/asset.domain';
import { AssetNotFoundError } from '../domain/catalog.errors';
import { Asset } from '../domain/catalog.types';
import { AssetCatalogService } from './asset-catalog.service';

describe('AssetCatalogService', () => {
    it('exposes the lookups other modules need', async () => {
        const asset: Asset = { id: 'a' } as Asset;
        const byMarket: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(asset);
        const domain: AssetDomain = {
            findById: vi.fn().mockResolvedValue(asset),
            findManyByIds: vi.fn().mockResolvedValue([asset]),
            findByMarketAndExternalId: byMarket
        } as unknown as AssetDomain;
        const service: AssetCatalogService = new AssetCatalogService(domain);

        expect(await service.findById('a')).toBe(asset);
        expect(await service.findManyByIds(['a'])).toEqual([asset]);
        expect(await service.findByMarketAndExternalId('B3', 'ITUB4')).toBe(asset);
        expect(byMarket).toHaveBeenCalledWith('B3', 'ITUB4');
    });

    it('requireById devolve o ativo e lança catalog.asset_not_found quando não existe', async () => {
        const asset: Asset = { id: 'a' } as Asset;
        const findById: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValueOnce(asset).mockResolvedValueOnce(null);
        const service: AssetCatalogService = new AssetCatalogService({ findById } as unknown as AssetDomain);

        await expect(service.requireById('a')).resolves.toBe(asset);
        await expect(service.requireById('missing')).rejects.toBeInstanceOf(AssetNotFoundError);
    });
});
