import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`CREATE INDEX "MarketDocuments_assetIds_idx" ON "MarketDocuments" USING GIN ("assetIds")`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`DROP INDEX "MarketDocuments_assetIds_idx"`.execute(db);
}
