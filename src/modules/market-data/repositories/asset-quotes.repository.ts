import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareGlobalRepository } from '../../../core/database/repositories/bare-global.repository';
import { QuoteRecord, QuoteWrite } from '../domain/market-data.types';

const UPSERT_CHUNK: number = 500;

function chunksOf<T>(items: readonly T[], size: number): T[][] {
    return Array.from({ length: Math.ceil(items.length / size) }, (_unused: unknown, index: number) =>
        items.slice(index * size, (index + 1) * size)
    );
}

@Injectable()
export class AssetQuotesRepository extends BareGlobalRepository<'AssetQuotes'> {
    public constructor(database: DatabaseClient) {
        super(database, 'AssetQuotes');
    }

    public async findByAssetIds(assetIds: readonly string[]): Promise<QuoteRecord[]> {
        if (assetIds.length === 0) {
            return [];
        }
        return this.db
            .selectFrom('AssetQuotes')
            .select(['assetId', 'price', 'currency', 'source', sql<string>`to_char("priceDate", 'YYYY-MM-DD')`.as('priceDate')])
            .where('assetId', 'in', assetIds)
            .execute();
    }

    public async upsertQuotes(quotes: readonly QuoteWrite[], fetchedAt: Date): Promise<number> {
        const written: number[] = [];
        for (const chunk of chunksOf(quotes, UPSERT_CHUNK)) {
            written.push(await this.upsertChunk(chunk, fetchedAt));
        }
        return written.reduce((total: number, count: number): number => total + count, 0);
    }

    private async upsertChunk(quotes: readonly QuoteWrite[], fetchedAt: Date): Promise<number> {
        const rows: { assetId: string }[] = await this.db
            .insertInto('AssetQuotes')
            .values(quotes.map((quote: QuoteWrite) => ({ ...quote, fetchedAt, updatedAt: fetchedAt })))
            .onConflict((conflict) =>
                conflict
                    .column('assetId')
                    .doUpdateSet((eb) => ({
                        price: eb.ref('excluded.price'),
                        currency: eb.ref('excluded.currency'),
                        priceDate: eb.ref('excluded.priceDate'),
                        source: eb.ref('excluded.source'),
                        fetchedAt: eb.ref('excluded.fetchedAt'),
                        updatedAt: eb.ref('excluded.updatedAt')
                    }))
                    .where((eb) => eb('excluded.priceDate', '>=', eb.ref('AssetQuotes.priceDate')))
            )
            .returning('assetId')
            .execute();
        return rows.length;
    }
}
