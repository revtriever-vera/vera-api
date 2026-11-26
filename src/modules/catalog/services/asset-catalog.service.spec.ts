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

    it('keeps the best ranked asset of each symbol', async () => {
        const ranked: Asset[] = [
            { id: 'btc', symbol: 'BTC' },
            { id: 'wrapped-btc', symbol: 'BTC' },
            { id: 'eth', symbol: 'ETH' }
        ] as Asset[];
        const findActiveByMarketAndSymbols: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(ranked);
        const service: AssetCatalogService = new AssetCatalogService({ findActiveByMarketAndSymbols } as unknown as AssetDomain);

        const found: Asset[] = await service.findBestByMarketAndSymbols('CRYPTO', ['BTC', 'ETH']);

        expect(found.map((asset: Asset): string => asset.id)).toEqual(['btc', 'eth']);
        expect(findActiveByMarketAndSymbols).toHaveBeenCalledWith('CRYPTO', ['BTC', 'ETH']);
    });

    it('requireById devolve o ativo e lança catalog.asset_not_found quando não existe', async () => {
        const asset: Asset = { id: 'a' } as Asset;
        const findById: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValueOnce(asset).mockResolvedValueOnce(null);
        const service: AssetCatalogService = new AssetCatalogService({ findById } as unknown as AssetDomain);

        await expect(service.requireById('a')).resolves.toBe(asset);
        await expect(service.requireById('missing')).rejects.toBeInstanceOf(AssetNotFoundError);
    });
});

describe('AssetCatalogService.searchByName', () => {
    it('busca por nome e devolve só os ativos do mercado pedido', async () => {
        const search: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue([
            { symbol: 'PETR4', market: 'B3' },
            { symbol: 'PETRO', market: 'CRYPTO' }
        ]);
        const service: AssetCatalogService = new AssetCatalogService({ search } as unknown as AssetDomain);

        const found: Asset[] = await service.searchByName('B3', ' Petrobras ', 30);

        expect(found.map((asset: Asset): string => asset.symbol)).toEqual(['PETR4']);
        expect(search).toHaveBeenCalledWith({ text: 'petrobras', likeText: 'petrobras', limit: 30 });
    });
});

describe('AssetCatalogService.searchAny', () => {
    it('busca em qualquer mercado, com o texto limpo e o limite pedido', async () => {
        const search: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue([{ symbol: 'PETR4' }, { symbol: 'PETRO' }]);
        const service: AssetCatalogService = new AssetCatalogService({ search } as unknown as AssetDomain);

        const found: Asset[] = await service.searchAny(' 100% Petro_ ', 3);

        expect(found).toHaveLength(2);
        expect(search).toHaveBeenCalledWith({ text: '100% petro_', likeText: String.raw`100\% petro\_`, limit: 3 });
    });
});
