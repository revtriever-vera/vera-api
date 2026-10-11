import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('BankConnectionAccounts')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('connectionId', 'uuid', (col) => col.notNull().references('BankConnections.id').onDelete('cascade'))
        .addColumn('accountId', 'uuid', (col) => col.notNull().references('FinancialAccounts.id').onDelete('cascade'))
        .addColumn('externalAccountId', 'text', (col) => col.notNull())
        .addColumn('syncedThrough', 'date')
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();

    await sql`CREATE UNIQUE INDEX "BankConnectionAccounts_companyId_connectionId_externalAccountId_unique" ON "BankConnectionAccounts" ("companyId", "connectionId", "externalAccountId") WHERE "deletedAt" IS NULL`.execute(
        db
    );
    await sql`CREATE INDEX "BankConnectionAccounts_companyId_accountId_idx" ON "BankConnectionAccounts" ("companyId", "accountId") WHERE "deletedAt" IS NULL`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('BankConnectionAccounts').execute();
}
