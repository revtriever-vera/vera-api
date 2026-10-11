import { AssetKind, CatalogSource } from '../domain/catalog.types';

export interface SourceAsset {
    readonly externalId: string;
    readonly symbol: string;
    readonly name: string;
    readonly kind: AssetKind;
    readonly currency: string;
    readonly maturityDate?: string;
    readonly rank?: number;
    readonly raw: Readonly<Record<string, string>>;
}

export abstract class AssetSourcePort {
    public abstract readonly source: CatalogSource;

    public abstract fetchAll(): Promise<readonly SourceAsset[]>;
}

export const ASSET_SOURCES: unique symbol = Symbol('ASSET_SOURCES');
