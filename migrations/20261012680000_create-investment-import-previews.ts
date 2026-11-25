import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('InvestmentImportPreviews')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('createdBy', 'uuid', (col) => col.references('Users.id').onDelete('set null'))
        .addColumn('holderUserId', 'uuid', (col) => col.references('Users.id').onDelete('set null'))
        .addColumn('source', 'text', (col) => col.notNull().check(sql`"source" IN ('b3', 'crypto_csv', 'model')`))
        .addColumn('fileSha256', 'text', (col) => col.notNull())
        .addColumn('fileName', 'text', (col) => col.notNull())
        .addColumn('payload', 'jsonb', (col) => col.notNull())
        .addColumn('expiresAt', 'timestamptz', (col) => col.notNull())
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();

    await sql`CREATE INDEX "InvestmentImportPreviews_companyId_expiresAt_idx" ON "InvestmentImportPreviews" ("companyId", "expiresAt")`.execute(
        db
    );
    await sql`CREATE INDEX "InvestmentImportPreviews_expiresAt_idx" ON "InvestmentImportPreviews" ("expiresAt")`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('InvestmentImportPreviews').execute();
}
