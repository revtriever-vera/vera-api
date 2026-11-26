import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('FundQuoteCoverage')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('assetId', 'uuid', (col) => col.notNull().references('Assets.id').onDelete('cascade'))
        .addColumn('coveredFrom', 'date', (col) => col.notNull())
        .addColumn('coveredTo', 'date', (col) => col.notNull())
        .addColumn('readAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE UNIQUE INDEX "FundQuoteCoverage_assetId_key" ON "FundQuoteCoverage" ("assetId")`.execute(db);
    await sql`CREATE INDEX "FundQuoteCoverage_readAt_idx" ON "FundQuoteCoverage" ("readAt")`.execute(db);
    await db.schema
        .createTable('FundQuotePoints')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('assetId', 'uuid', (col) => col.notNull().references('Assets.id').onDelete('cascade'))
        .addColumn('date', 'date', (col) => col.notNull())
        .addColumn('quota', sql`numeric(24, 10)`, (col) => col.notNull())
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('fetchedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE UNIQUE INDEX "FundQuotePoints_assetId_date_key" ON "FundQuotePoints" ("assetId", "date")`.execute(db);
    await sql`CREATE INDEX "FundQuotePoints_date_idx" ON "FundQuotePoints" ("date")`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('FundQuotePoints').execute();
    await db.schema.dropTable('FundQuoteCoverage').execute();
}
