import { Injectable } from '@nestjs/common';
import { AssetIssuerLinksRepository } from '../repositories/asset-issuer-links.repository';
import { AssetIssuerLinkRow, AssetIssuerLinkWrite, CNPJ_PATTERN, IssuerKind, IssuerLink } from './portfolio-events.types';

@Injectable()
export class AssetIssuerLinkDomain {
    public constructor(private readonly links: AssetIssuerLinksRepository) {}

    public async saveMany(links: readonly AssetIssuerLinkWrite[]): Promise<number> {
        const valid: Map<string, AssetIssuerLinkWrite> = new Map<string, AssetIssuerLinkWrite>();
        for (const link of links) {
            if (CNPJ_PATTERN.test(link.cnpj)) {
                valid.set(link.assetId, link);
            }
        }
        await this.links.upsertMany([...valid.values()]);
        return valid.size;
    }

    public async findByAssetIds(assetIds: readonly string[]): Promise<IssuerLink[]> {
        const rows: AssetIssuerLinkRow[] = await this.links.findByAssetIds(assetIds);
        return rows.map((row: AssetIssuerLinkRow): IssuerLink => ({
            assetId: row.assetId,
            issuerKind: row.issuerKind as IssuerKind,
            cnpj: row.cnpj
        }));
    }
}
