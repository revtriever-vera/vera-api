import { Injectable } from '@nestjs/common';
import { AssetProfile, profileOf } from '../domain/asset-profiles';
import { AssetDomain } from '../domain/asset.domain';
import { AssetNotFoundError } from '../domain/catalog.errors';
import { escapeLike } from '../../../shared/utils/like.util';
import { Asset, CatalogMarket } from '../domain/catalog.types';

export type { Asset, AssetProfile };

@Injectable()
export class AssetCatalogService {
    public constructor(private readonly assets: AssetDomain) {}

    public async findById(id: string): Promise<Asset | null> {
        return this.assets.findById(id);
    }

    public async requireById(id: string): Promise<Asset> {
        const asset: Asset | null = await this.assets.findById(id);
        if (asset === null) {
            throw new AssetNotFoundError(id);
        }
        return asset;
    }

    public async findManyByIds(ids: readonly string[]): Promise<Asset[]> {
        return this.assets.findManyByIds(ids);
    }

    public async findManyByMarketAndExternalIds(market: CatalogMarket, externalIds: readonly string[]): Promise<Asset[]> {
        return this.assets.findManyByMarketAndExternalIds(market, externalIds);
    }

    public async findBestByMarketAndSymbols(market: CatalogMarket, symbols: readonly string[]): Promise<Asset[]> {
        const ranked: Asset[] = await this.assets.findActiveByMarketAndSymbols(market, symbols);
        const best: Map<string, Asset> = new Map();
        for (const asset of ranked) {
            if (!best.has(asset.symbol)) {
                best.set(asset.symbol, asset);
            }
        }
        return [...best.values()];
    }

    public async findByMarketAndExternalId(market: CatalogMarket, externalId: string): Promise<Asset | null> {
        return this.assets.findByMarketAndExternalId(market, externalId);
    }

    public async searchByName(market: CatalogMarket, name: string, limit: number): Promise<Asset[]> {
        const text: string = name.trim().toLowerCase();
        const found: Asset[] = await this.assets.search({ text, likeText: escapeLike(text), limit });
        return found.filter((asset: Asset): boolean => asset.market === market);
    }

    public profileOf(asset: Pick<Asset, 'market' | 'symbol'>): AssetProfile {
        return profileOf(asset.market, asset.symbol);
    }
}
