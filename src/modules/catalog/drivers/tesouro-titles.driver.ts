import { Injectable } from '@nestjs/common';
import { ASSET_KINDS, CATALOG_SOURCES, CatalogSource } from '../domain/catalog.types';
import { TreasuryType, treasuryTypeOf } from '../domain/treasury-types';
import { AssetSourcePort, SourceAsset } from '../ports/asset-source.port';
import { TesouroBond, TesouroCsvReaderService, TesouroReadResult } from '../services/tesouro-csv-reader.service';

function assetOf(bond: TesouroBond, type: TreasuryType): SourceAsset {
    const year: string = bond.maturityDate.slice(0, 4);
    return {
        externalId: `${type.slug}:${bond.maturityDate}`,
        symbol: `${type.label} ${year}`,
        name: `${type.label} ${bond.maturityDate}`,
        kind: ASSET_KINDS.treasury,
        currency: 'BRL',
        maturityDate: bond.maturityDate,
        raw: { type: bond.typeName, baseDate: bond.baseDate }
    };
}

@Injectable()
export class TesouroTitlesDriver extends AssetSourcePort {
    public readonly source: CatalogSource = CATALOG_SOURCES.tesouro;

    public constructor(private readonly reader: TesouroCsvReaderService) {
        super();
    }

    public async fetchAll(): Promise<readonly SourceAsset[]> {
        const result: TesouroReadResult = await this.reader.readLatest({ ignoreCache: true });
        if (!result.changed) {
            return [];
        }
        const assets: SourceAsset[] = [];
        for (const bond of result.bonds) {
            const type: TreasuryType | null = treasuryTypeOf(bond.typeName);
            if (type !== null && bond.maturityDate > bond.baseDate) {
                assets.push(assetOf(bond, type));
            }
        }
        return assets;
    }
}
