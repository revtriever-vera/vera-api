import { Injectable } from '@nestjs/common';
import { AssetDomain } from '../domain/asset.domain';
import { Asset, CatalogMarket } from '../domain/catalog.types';

@Injectable()
export class AssetCatalogService {
    public constructor(private readonly assets: AssetDomain) {}

    public async findById(id: string): Promise<Asset | null> {
        return this.assets.findById(id);
    }

    public async findManyByIds(ids: readonly string[]): Promise<Asset[]> {
        return this.assets.findManyByIds(ids);
    }

    public async findByMarketAndExternalId(market: CatalogMarket, externalId: string): Promise<Asset | null> {
        return this.assets.findByMarketAndExternalId(market, externalId);
    }
}
