import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('MarketDocuments')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('source', 'text', (col) => col.notNull())
        .addColumn('externalId', 'text', (col) => col.notNull())
        .addColumn('issuerCnpj', 'text')
        .addColumn('assetIds', sql`uuid[]`, (col) => col.notNull().defaultTo(sql`'{}'::uuid[]`))
        .addColumn('category', 'text', (col) => col.notNull())
        .addColumn('title', 'text', (col) => col.notNull())
        .addColumn('publishedAt', 'timestamptz', (col) => col.notNull())
        .addColumn('url', 'text', (col) => col.notNull())
        .addColumn('extractedText', 'text')
        .addColumn('textHash', 'text')
        .addColumn('status', 'text', (col) => col.notNull().defaultTo('pending'))
        .addColumn('skipReason', 'text')
        .addColumn('attempts', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE UNIQUE INDEX "MarketDocuments_source_externalId_key" ON "MarketDocuments" ("source", "externalId")`.execute(db);
    await sql`CREATE INDEX "MarketDocuments_status_publishedAt_idx" ON "MarketDocuments" ("status", "publishedAt")`.execute(db);
    await sql`CREATE INDEX "MarketDocuments_publishedAt_idx" ON "MarketDocuments" ("publishedAt")`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('MarketDocuments').execute();
}
