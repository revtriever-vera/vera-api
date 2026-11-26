import { Injectable } from '@nestjs/common';
import { RawBuilder } from 'kysely';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareGlobalRepository } from '../../../core/database/repositories/bare-global.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { DOCUMENT_STATUSES, MarketDocumentInsert, MarketDocumentRow, MarketDocumentWrite } from '../domain/market-documents.types';

const UPSERT_CHUNK: number = 200;
const DELETE_BATCH: number = 500;

function chunksOf<T>(items: readonly T[], size: number): T[][] {
    return Array.from({ length: Math.ceil(items.length / size) }, (_unused: unknown, index: number) =>
        items.slice(index * size, (index + 1) * size)
    );
}

type TransitionPatch = Partial<Pick<MarketDocumentRow, 'status' | 'skipReason' | 'extractedText' | 'textHash' | 'attempts'>>;

function rowOf(document: MarketDocumentWrite): MarketDocumentInsert {
    return {
        id: IdUtil.newId(),
        source: document.source,
        externalId: document.externalId,
        issuerCnpj: document.issuerCnpj,
        assetIds: [...document.assetIds],
        category: document.category,
        title: document.title,
        publishedAt: new Date(document.publishedAt),
        url: document.url,
        status: document.status,
        skipReason: document.skipReason
    };
}

@Injectable()
export class MarketDocumentsRepository extends BareGlobalRepository<'MarketDocuments'> {
    public constructor(database: DatabaseClient) {
        super(database, 'MarketDocuments');
    }

    public async upsertMany(documents: readonly MarketDocumentWrite[]): Promise<void> {
        for (const chunk of chunksOf(documents, UPSERT_CHUNK)) {
            await this.upsertChunk(chunk);
        }
    }

    private async upsertChunk(chunk: readonly MarketDocumentWrite[]): Promise<void> {
        await this.insertBuilder()
            .values(chunk.map(rowOf))
            .onConflict((conflict) =>
                conflict
                    .columns(['source', 'externalId'])
                    .doUpdateSet({ assetIds: this.unionOfAssetIds(), updatedAt: new Date() })
                    .where(this.hasNewAssetIds())
            )
            .execute();
    }

    private unionOfAssetIds(): RawBuilder<string[]> {
        return this.rawSql<string[]>`ARRAY(SELECT DISTINCT unnest("MarketDocuments"."assetIds" || excluded."assetIds") ORDER BY 1)`;
    }

    private hasNewAssetIds(): RawBuilder<boolean> {
        return this.rawSql<boolean>`NOT ("MarketDocuments"."assetIds" @> excluded."assetIds")`;
    }

    public async findPending(limit: number): Promise<MarketDocumentRow[]> {
        return this.selectScoped()
            .selectAll()
            .where('status', '=', DOCUMENT_STATUSES.pending)
            .orderBy('publishedAt', 'desc')
            .limit(limit)
            .execute();
    }

    public async findExtracted(limit: number): Promise<MarketDocumentRow[]> {
        return this.selectScoped()
            .selectAll()
            .where('status', '=', DOCUMENT_STATUSES.extracted)
            .orderBy('publishedAt', 'desc')
            .limit(limit)
            .execute();
    }

    public async transitionPending(id: string, patch: TransitionPatch): Promise<boolean> {
        const rows: MarketDocumentRow[] = await this.updateManyRows({ id, status: DOCUMENT_STATUSES.pending }, patch);
        return rows.length > 0;
    }

    public async transitionExtracted(id: string, patch: TransitionPatch): Promise<boolean> {
        const rows: MarketDocumentRow[] = await this.updateManyRows({ id, status: DOCUMENT_STATUSES.extracted }, patch);
        return rows.length > 0;
    }

    public async deleteOlderThan(cutoff: Date): Promise<number> {
        let deleted: number = 0;
        let removed: number = await this.hardDeleteBefore('publishedAt', cutoff, DELETE_BATCH);
        while (removed > 0) {
            deleted += removed;
            removed = removed < DELETE_BATCH ? 0 : await this.hardDeleteBefore('publishedAt', cutoff, DELETE_BATCH);
        }
        return deleted;
    }
}
