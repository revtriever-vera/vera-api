import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareGlobalRepository } from '../../../core/database/repositories/bare-global.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { AssetIssuerLinkRow, AssetIssuerLinkWrite } from '../domain/portfolio-events.types';

const UPSERT_CHUNK: number = 500;

function chunksOf<T>(items: readonly T[], size: number): T[][] {
    return Array.from({ length: Math.ceil(items.length / size) }, (_unused: unknown, index: number) =>
        items.slice(index * size, (index + 1) * size)
    );
}

@Injectable()
export class AssetIssuerLinksRepository extends BareGlobalRepository<'AssetIssuerLinks'> {
    public constructor(database: DatabaseClient) {
        super(database, 'AssetIssuerLinks');
    }

    public async findByAssetIds(assetIds: readonly string[]): Promise<AssetIssuerLinkRow[]> {
        if (assetIds.length === 0) {
            return [];
        }
        return this.selectScoped().selectAll().where('assetId', 'in', assetIds).execute();
    }

    public async upsertMany(links: readonly AssetIssuerLinkWrite[]): Promise<void> {
        for (const chunk of chunksOf(links, UPSERT_CHUNK)) {
            await this.upsertChunk(chunk);
        }
    }

    private async upsertChunk(chunk: readonly AssetIssuerLinkWrite[]): Promise<void> {
        await this.insertBuilder()
            .values(chunk.map((link: AssetIssuerLinkWrite) => ({ id: IdUtil.newId(), ...link })))
            .onConflict((conflict) =>
                conflict.column('assetId').doUpdateSet((eb) => ({
                    issuerKind: eb.ref('excluded.issuerKind'),
                    cnpj: eb.ref('excluded.cnpj'),
                    cvmCode: eb.ref('excluded.cvmCode'),
                    assetClass: eb.ref('excluded.assetClass'),
                    source: eb.ref('excluded.source'),
                    updatedAt: new Date()
                }))
            )
            .execute();
    }
}
