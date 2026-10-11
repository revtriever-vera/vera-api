import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('TransactionImports')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('accountId', 'uuid', (col) => col.notNull().references('FinancialAccounts.id').onDelete('cascade'))
        .addColumn('format', 'text', (col) =>
            col.notNull().check(sql`"format" IN ('ofx', 'csv_nubank_card', 'csv_nubank_account', 'csv_generic')`)
        )
        .addColumn('fileName', 'text', (col) => col.notNull().check(sql`char_length("fileName") <= 120`))
        .addColumn('fileSha256', 'char(64)', (col) => col.notNull())
        .addColumn('rows', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('inserted', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('duplicates', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('rejected', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('periodStart', 'date')
        .addColumn('periodEnd', 'date')
        .addColumn('status', 'text', (col) => col.notNull().check(sql`"status" IN ('processing', 'completed', 'undone', 'failed')`))
        .addColumn('isSample', 'boolean', (col) => col.notNull().defaultTo(false))
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();

    await sql`CREATE INDEX "TransactionImports_companyId_createdAt_idx" ON "TransactionImports" ("companyId", "createdAt" DESC) WHERE "deletedAt" IS NULL`.execute(
        db
    );
    await sql`CREATE INDEX "TransactionImports_companyId_fileSha256_idx" ON "TransactionImports" ("companyId", "fileSha256") WHERE "deletedAt" IS NULL`.execute(
        db
    );
    await sql`CREATE INDEX "TransactionImports_companyId_accountId_idx" ON "TransactionImports" ("companyId", "accountId") WHERE "deletedAt" IS NULL`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('TransactionImports').execute();
}
