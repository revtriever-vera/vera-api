import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('RecurringAlerts')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('seriesId', 'uuid', (col) => col.notNull().references('RecurringSeries.id').onDelete('cascade'))
        .addColumn('kind', 'text', (col) =>
            col.notNull().check(sql`"kind" IN ('price_increase', 'duplicate_charge', 'duplicate_account', 'trial_converted', 'returned')`)
        )
        .addColumn('fingerprint', 'text', (col) => col.notNull())
        .addColumn('occurredOn', 'date', (col) => col.notNull())
        .addColumn('data', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
        .addColumn('seenAt', 'timestamptz')
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();
    await sql`CREATE UNIQUE INDEX "RecurringAlerts_series_kind_fingerprint_unique" ON "RecurringAlerts" ("companyId", "seriesId", "kind", "fingerprint") WHERE "deletedAt" IS NULL`.execute(
        db
    );
    await sql`CREATE INDEX "RecurringAlerts_company_seen" ON "RecurringAlerts" ("companyId", "seenAt") WHERE "deletedAt" IS NULL`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('RecurringAlerts').execute();
}
