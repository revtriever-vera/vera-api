import { Injectable } from '@nestjs/common';
import { ASSET_KINDS, AssetKind, CATALOG_SOURCES, ISSUER_LINK_ORIGINS, IssuerLinkOrigin, MARKETS } from '../domain/catalog.types';
import { SourceAsset } from '../ports/asset-source.port';
import { AssetSourceRegistryService } from './asset-source-registry.service';

export interface IssuerLinkSource {
    readonly market: typeof MARKETS.b3;
    readonly symbol: string;
    readonly cnpj: string;
    readonly cvmCode: string | null;
    readonly isFund: boolean;
    readonly origin: IssuerLinkOrigin;
}

const ORIGIN_BY_KIND: Readonly<Partial<Record<AssetKind, IssuerLinkOrigin>>> = {
    [ASSET_KINDS.stock]: ISSUER_LINK_ORIGINS.companyRegistry,
    [ASSET_KINDS.fii]: ISSUER_LINK_ORIGINS.fundMonthlyReport
};

function linkOf(asset: SourceAsset): IssuerLinkSource | null {
    const origin: IssuerLinkOrigin | undefined = ORIGIN_BY_KIND[asset.kind];
    const cnpj: string | undefined = asset.raw['cnpj'];
    if (origin === undefined || cnpj === undefined) {
        return null;
    }
    return {
        market: MARKETS.b3,
        symbol: asset.symbol,
        cnpj,
        cvmCode: asset.raw['cvmCode'] ?? null,
        isFund: asset.kind === ASSET_KINDS.fii,
        origin
    };
}

@Injectable()
export class IssuerLinkSourceService {
    public constructor(private readonly registry: AssetSourceRegistryService) {}

    public async listB3Issuers(): Promise<IssuerLinkSource[]> {
        const port: ReturnType<AssetSourceRegistryService['portFor']> = this.registry.portFor(CATALOG_SOURCES.b3);
        if (port === null) {
            return [];
        }
        const assets: readonly SourceAsset[] = await port.fetchAll();
        return assets.map(linkOf).filter((link: IssuerLinkSource | null): link is IssuerLinkSource => link !== null);
    }
}
