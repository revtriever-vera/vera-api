import { Injectable } from '@nestjs/common';
import { Asset, AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { IssuerLinkSource, IssuerLinkSourceService } from '../../catalog/services/issuer-link-source.service';
import { AssetIssuerLinkDomain } from '../domain/asset-issuer-link.domain';
import { AssetIssuerLinkWrite, ISSUER_KINDS, shareClassOfTicker } from '../domain/portfolio-events.types';
import { PortfolioEventsLogService } from '../services/portfolio-events-log.service';

const LOOKUP_CHUNK: number = 2000;

function chunksOf<T>(items: readonly T[], size: number): T[][] {
    return Array.from({ length: Math.ceil(items.length / size) }, (_unused: unknown, index: number) =>
        items.slice(index * size, (index + 1) * size)
    );
}

@Injectable()
export class IssuerLinksApplication {
    public constructor(
        private readonly issuers: IssuerLinkSourceService,
        private readonly catalog: AssetCatalogService,
        private readonly links: AssetIssuerLinkDomain,
        private readonly logs: PortfolioEventsLogService
    ) {}

    public async refresh(): Promise<number> {
        const sources: IssuerLinkSource[] = await this.issuers.listB3Issuers();
        const assets: Map<string, Asset> = await this.assetsByTicker(sources);
        const writes: AssetIssuerLinkWrite[] = sources.flatMap((source: IssuerLinkSource): AssetIssuerLinkWrite[] => {
            const asset: Asset | undefined = assets.get(source.symbol);
            return asset === undefined ? [] : [this.writeOf(asset, source)];
        });
        const saved: number = await this.links.saveMany(writes);
        this.logs.linksRefreshed(sources.length, writes.length, saved);
        return saved;
    }

    private async assetsByTicker(sources: readonly IssuerLinkSource[]): Promise<Map<string, Asset>> {
        const found: Asset[] = [];
        for (const symbols of chunksOf(
            sources.map((source: IssuerLinkSource): string => source.symbol),
            LOOKUP_CHUNK
        )) {
            found.push(...(await this.catalog.findManyByMarketAndExternalIds('B3', symbols)));
        }
        return new Map<string, Asset>(found.map((asset: Asset): [string, Asset] => [asset.externalId, asset]));
    }

    private writeOf(asset: Asset, source: IssuerLinkSource): AssetIssuerLinkWrite {
        return {
            assetId: asset.id,
            issuerKind: source.isFund ? ISSUER_KINDS.fund : ISSUER_KINDS.company,
            cnpj: source.cnpj,
            cvmCode: source.cvmCode,
            source: source.origin,
            assetClass: source.isFund || asset.kind !== 'stock' ? null : shareClassOfTicker(source.symbol)
        };
    }
}
