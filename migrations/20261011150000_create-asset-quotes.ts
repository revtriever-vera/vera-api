import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('AssetQuotes')
        .addColumn('assetId', 'uuid', (col) => col.primaryKey().references('Assets.id'))
        .addColumn('price', sql`numeric(24, 8)`, (col) => col.notNull())
        .addColumn('currency', sql`char(3)`, (col) => col.notNull())
        .addColumn('priceDate', 'date', (col) => col.notNull())
        .addColumn('source', 'text', (col) => col.notNull())
        .addColumn('fetchedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE INDEX "AssetQuotes_priceDate_idx" ON "AssetQuotes" ("priceDate")`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('AssetQuotes').execute();
}
