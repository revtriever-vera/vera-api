import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`.execute(db);
    await db.schema
        .createTable('Assets')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('market', 'text', (col) => col.notNull())
        .addColumn('externalId', 'text', (col) => col.notNull())
        .addColumn('symbol', 'text', (col) => col.notNull())
        .addColumn('name', 'text', (col) => col.notNull())
        .addColumn('kind', 'text', (col) => col.notNull())
        .addColumn('typeGroup', 'text', (col) => col.notNull())
        .addColumn('suggestedClassKey', 'text')
        .addColumn('dollarExposure', 'boolean', (col) => col.notNull().defaultTo(false))
        .addColumn('currency', sql`char(3)`, (col) => col.notNull())
        .addColumn('quotesProvider', 'text', (col) => col.notNull())
        .addColumn('quantityDecimals', 'smallint', (col) => col.notNull())
        .addColumn('maturityDate', 'date')
        .addColumn('popularRank', 'smallint')
        .addColumn('rank', 'smallint')
        .addColumn('status', 'text', (col) => col.notNull().defaultTo('active'))
        .addColumn('sourceHash', 'text')
        .addColumn('seenAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE UNIQUE INDEX "Assets_market_externalId_key" ON "Assets" ("market", "externalId")`.execute(db);
    await sql`CREATE INDEX "Assets_symbol_trgm_idx" ON "Assets" USING gin (lower("symbol") gin_trgm_ops)`.execute(db);
    await sql`CREATE INDEX "Assets_name_trgm_idx" ON "Assets" USING gin (lower("name") gin_trgm_ops)`.execute(db);
    await sql`CREATE INDEX "Assets_typeGroup_status_popularRank_idx" ON "Assets" ("typeGroup", "status", "popularRank")`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('Assets').execute();
}
