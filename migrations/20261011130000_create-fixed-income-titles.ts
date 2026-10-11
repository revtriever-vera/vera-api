import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('FixedIncomeTitles')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('kind', 'text', (col) => col.notNull())
        .addColumn('name', 'text', (col) => col.notNull())
        .addColumn('indexer', 'text', (col) => col.notNull())
        .addColumn('rateBps', 'integer', (col) => col.notNull())
        .addColumn('currency', sql`char(3)`, (col) => col.notNull().defaultTo('BRL'))
        .addColumn('appliedMinor', 'bigint', (col) => col.notNull().check(sql`"appliedMinor" > 0`))
        .addColumn('appliedAt', 'date', (col) => col.notNull())
        .addColumn('maturityDate', 'date', (col) => col.notNull())
        .addColumn('taxRegime', 'text', (col) => col.notNull())
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .addCheckConstraint('FixedIncomeTitles_maturity_after_applied', sql`"maturityDate" > "appliedAt"`)
        .execute();

    await sql`CREATE INDEX "FixedIncomeTitles_companyId_createdAt_idx" ON "FixedIncomeTitles" ("companyId", "createdAt" DESC) WHERE "deletedAt" IS NULL`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('FixedIncomeTitles').execute();
}
