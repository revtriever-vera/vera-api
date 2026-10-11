import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('ProviderUsage')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('provider', 'text', (col) => col.notNull())
        .addColumn('windowKind', 'text', (col) => col.notNull())
        .addColumn('windowStart', 'timestamptz', (col) => col.notNull())
        .addColumn('count', 'integer', (col) => col.notNull())
        .execute();
    await sql`CREATE UNIQUE INDEX "ProviderUsage_provider_windowKind_windowStart_key" ON "ProviderUsage" ("provider", "windowKind", "windowStart")`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('ProviderUsage').execute();
}
