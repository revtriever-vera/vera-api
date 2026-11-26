import { Injectable } from '@nestjs/common';
import { AssetIssuerLinkDomain } from '../domain/asset-issuer-link.domain';
import { IssuerLink } from '../domain/portfolio-events.types';

export type { IssuerKind, IssuerLink } from '../domain/portfolio-events.types';

@Injectable()
export class IssuerLinkReaderService {
    public constructor(private readonly links: AssetIssuerLinkDomain) {}

    public async forAssets(assetIds: readonly string[]): Promise<IssuerLink[]> {
        return this.links.findByAssetIds(assetIds);
    }
}
