import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('CatalogSyncRuns')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('source', 'text', (col) => col.notNull())
        .addColumn('startedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('finishedAt', 'timestamptz')
        .addColumn('status', 'text', (col) => col.notNull())
        .addColumn('fetched', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('upserted', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('delisted', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('errorCode', 'text')
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE INDEX "CatalogSyncRuns_source_startedAt_idx" ON "CatalogSyncRuns" ("source", "startedAt" DESC)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('CatalogSyncRuns').execute();
}
