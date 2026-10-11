import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('QuoteFetchFailures')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('assetId', 'uuid', (col) => col.references('Assets.id'))
        .addColumn('provider', 'text', (col) => col.notNull())
        .addColumn('stage', 'text', (col) => col.notNull())
        .addColumn('reason', 'text', (col) => col.notNull())
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('resolvedAt', 'timestamptz')
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE INDEX "QuoteFetchFailures_provider_createdAt_open_idx" ON "QuoteFetchFailures" ("provider", "createdAt") WHERE "resolvedAt" IS NULL`.execute(
        db
    );
    await sql`CREATE INDEX "QuoteFetchFailures_assetId_open_idx" ON "QuoteFetchFailures" ("assetId") WHERE "resolvedAt" IS NULL`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('QuoteFetchFailures').execute();
}
