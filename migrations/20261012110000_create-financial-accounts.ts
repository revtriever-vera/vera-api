import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('FinancialAccounts')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('kind', 'text', (col) => col.notNull().check(sql`"kind" IN ('checking', 'savings', 'credit_card', 'other')`))
        .addColumn('name', 'text', (col) => col.notNull().check(sql`char_length("name") BETWEEN 1 AND 60`))
        .addColumn('institutionName', 'text')
        .addColumn('numberLast4', 'char(4)')
        .addColumn('currency', 'char(3)', (col) => col.notNull())
        .addColumn('provider', 'text')
        .addColumn('externalId', 'text')
        .addColumn('isSample', 'boolean', (col) => col.notNull().defaultTo(false))
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .addCheckConstraint('FinancialAccounts_provider_matches_externalId', sql`("provider" IS NULL) = ("externalId" IS NULL)`)
        .execute();

    await sql`CREATE UNIQUE INDEX "FinancialAccounts_companyId_provider_externalId_unique" ON "FinancialAccounts" ("companyId", "provider", "externalId") WHERE "externalId" IS NOT NULL AND "deletedAt" IS NULL`.execute(
        db
    );
    await sql`CREATE INDEX "FinancialAccounts_companyId_createdAt_idx" ON "FinancialAccounts" ("companyId", "createdAt") WHERE "deletedAt" IS NULL`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('FinancialAccounts').execute();
}
