import { Injectable } from '@nestjs/common';
import { AssetDomain } from '../domain/asset.domain';
import { AssetNotFoundError } from '../domain/catalog.errors';
import { Asset, CatalogMarket } from '../domain/catalog.types';

export type { Asset };

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

    public async findByMarketAndExternalId(market: CatalogMarket, externalId: string): Promise<Asset | null> {
        return this.assets.findByMarketAndExternalId(market, externalId);
    }
}
