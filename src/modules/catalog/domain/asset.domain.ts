import { Injectable } from '@nestjs/common';
import { AssetsRepository } from '../repositories/assets.repository';
import {
    ASSET_STATUSES,
    Asset,
    AssetSearchCriteria,
    AssetWrite,
    CatalogMarket,
    SnapshotResult,
    StatusCount,
    StoredAssetState
} from './catalog.types';

@Injectable()
export class AssetDomain {
    public constructor(private readonly assets: AssetsRepository) {}

    public async findById(id: string): Promise<Asset | null> {
        return this.assets.findAssetById(id);
    }

    public async findManyByIds(ids: readonly string[]): Promise<Asset[]> {
        return this.assets.findAssetsByIds(ids);
    }

    public async findByMarketAndExternalId(market: CatalogMarket, externalId: string): Promise<Asset | null> {
        return this.assets.findAssetByMarketAndExternalId(market, externalId);
    }

    public async search(criteria: AssetSearchCriteria): Promise<Asset[]> {
        return this.assets.search(criteria);
    }

    public async countByStatus(market: CatalogMarket): Promise<StatusCount[]> {
        return this.assets.countByStatus(market);
    }

    public async applySnapshot(market: CatalogMarket, writes: readonly AssetWrite[], seenAt: Date): Promise<SnapshotResult> {
        const states: StoredAssetState[] = await this.assets.loadStates(market);
        const known: ReadonlyMap<string, StoredAssetState> = new Map<string, StoredAssetState>(
            states.map((state: StoredAssetState): [string, StoredAssetState] => [state.externalId, state])
        );
        const upserted: number = writes.filter((write: AssetWrite) => this.hasChanged(known.get(write.externalId), write)).length;
        await this.assets.upsertAll(writes, seenAt);
        const delisted: number = await this.assets.delistUnseen(market, seenAt);
        return { upserted, delisted };
    }

    private hasChanged(state: StoredAssetState | undefined, write: AssetWrite): boolean {
        return state === undefined || state.sourceHash !== write.sourceHash || state.status !== ASSET_STATUSES.active;
    }
}
