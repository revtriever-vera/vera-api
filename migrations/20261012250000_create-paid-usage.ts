import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('PaidUsageEntries')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('period', 'text', (col) => col.notNull().check(sql`"period" ~ '^[0-9]{4}-[0-9]{2}$'`))
        .addColumn('feature', 'text', (col) => col.notNull().check(sql`"feature" IN ('ai', 'whatsapp')`))
        .addColumn('task', 'text', (col) => col.notNull())
        .addColumn('referenceId', 'text', (col) => col.notNull())
        .addColumn('costMicros', 'bigint', (col) => col.notNull().check(sql`"costMicros" >= 0`))
        .addColumn('providerCostMicros', 'bigint', (col) => col.check(sql`"providerCostMicros" >= 0`))
        .addColumn('usdBrlRate', sql`numeric(10, 4)`)
        .addColumn('outcome', 'text', (col) => col.notNull().check(sql`"outcome" IN ('answered', 'unanswered')`))
        .addColumn('detail', 'jsonb')
        .addColumn('occurredAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE UNIQUE INDEX "PaidUsageEntries_reference_unique" ON "PaidUsageEntries" ("companyId", "feature", "referenceId")`.execute(
        db
    );
    await sql`CREATE INDEX "PaidUsageEntries_company_period" ON "PaidUsageEntries" ("companyId", "period")`.execute(db);
    await db.schema
        .createTable('PaidUsageNotices')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('period', 'text', (col) => col.notNull().check(sql`"period" ~ '^[0-9]{4}-[0-9]{2}$'`))
        .addColumn('kind', 'text', (col) => col.notNull().check(sql`"kind" IN ('warning', 'paused')`))
        .addColumn('sentAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE UNIQUE INDEX "PaidUsageNotices_unique" ON "PaidUsageNotices" ("companyId", "period", "kind")`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('PaidUsageNotices').execute();
    await db.schema.dropTable('PaidUsageEntries').execute();
}
