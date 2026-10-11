import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('Transactions')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('accountId', 'uuid', (col) => col.notNull().references('FinancialAccounts.id').onDelete('cascade'))
        .addColumn('source', 'text', (col) => col.notNull().check(sql`"source" IN ('pluggy', 'ofx', 'csv', 'sample')`))
        .addColumn('externalId', 'text', (col) => col.notNull())
        .addColumn('date', 'date', (col) => col.notNull())
        .addColumn('amountMinor', 'bigint', (col) => col.notNull().check(sql`"amountMinor" <> 0`))
        .addColumn('currency', 'char(3)', (col) => col.notNull())
        .addColumn('description', 'text', (col) => col.notNull().check(sql`char_length("description") <= 200`))
        .addColumn('normalizedDescription', 'text', (col) => col.notNull())
        .addColumn('counterpartyName', 'text', (col) => col.check(sql`char_length("counterpartyName") <= 80`))
        .addColumn('counterpartyKey', 'char(64)')
        .addColumn('providerCategoryId', 'text')
        .addColumn('installmentNumber', 'smallint')
        .addColumn('installmentTotal', 'smallint')
        .addColumn('categoryId', 'uuid', (col) => col.references('SpendingCategories.id').onDelete('set null'))
        .addColumn('categorySource', 'text', (col) =>
            col.notNull().check(sql`"categorySource" IN ('user', 'rule', 'dictionary', 'provider', 'none')`)
        )
        .addColumn('ruleId', 'uuid', (col) => col.references('CategoryRules.id').onDelete('set null'))
        .addColumn('importId', 'uuid', (col) => col.references('TransactionImports.id').onDelete('set null'))
        .addColumn('absorbedExternalId', 'text')
        .addColumn('absorbedImportId', 'uuid', (col) => col.references('TransactionImports.id').onDelete('set null'))
        .addColumn('supersededById', 'uuid')
        .addColumn('isSample', 'boolean', (col) => col.notNull().defaultTo(false))
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();

    await sql`CREATE UNIQUE INDEX "Transactions_companyId_accountId_externalId_unique" ON "Transactions" ("companyId", "accountId", "externalId") WHERE "deletedAt" IS NULL`.execute(
        db
    );
    await sql`CREATE INDEX "Transactions_companyId_date_id_idx" ON "Transactions" ("companyId", "date" DESC, "id" DESC) WHERE "deletedAt" IS NULL`.execute(
        db
    );
    await sql`CREATE INDEX "Transactions_companyId_categoryId_date_idx" ON "Transactions" ("companyId", "categoryId", "date") WHERE "deletedAt" IS NULL`.execute(
        db
    );
    await sql`CREATE INDEX "Transactions_companyId_accountId_amountMinor_date_idx" ON "Transactions" ("companyId", "accountId", "amountMinor", "date") WHERE "deletedAt" IS NULL`.execute(
        db
    );
    await sql`CREATE INDEX "Transactions_companyId_counterpartyKey_idx" ON "Transactions" ("companyId", "counterpartyKey") WHERE "deletedAt" IS NULL AND "counterpartyKey" IS NOT NULL`.execute(
        db
    );
    await sql`CREATE INDEX "Transactions_companyId_normalizedDescription_idx" ON "Transactions" ("companyId", "normalizedDescription") WHERE "deletedAt" IS NULL`.execute(
        db
    );
    await sql`CREATE INDEX "Transactions_companyId_accountId_absorbedExternalId_idx" ON "Transactions" ("companyId", "accountId", "absorbedExternalId") WHERE "deletedAt" IS NULL AND "absorbedExternalId" IS NOT NULL`.execute(
        db
    );
    await sql`CREATE INDEX "Transactions_companyId_importId_idx" ON "Transactions" ("companyId", "importId") WHERE "deletedAt" IS NULL AND "importId" IS NOT NULL`.execute(
        db
    );
    await sql`CREATE INDEX "Transactions_companyId_absorbedImportId_idx" ON "Transactions" ("companyId", "absorbedImportId") WHERE "deletedAt" IS NULL AND "absorbedImportId" IS NOT NULL`.execute(
        db
    );
    await sql`CREATE INDEX "Transactions_companyId_ruleId_idx" ON "Transactions" ("companyId", "ruleId") WHERE "deletedAt" IS NULL AND "ruleId" IS NOT NULL`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('Transactions').execute();
}
