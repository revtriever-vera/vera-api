import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('CategoryRules')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('categoryId', 'uuid', (col) => col.notNull().references('SpendingCategories.id').onDelete('cascade'))
        .addColumn('matchType', 'text', (col) => col.notNull().check(sql`"matchType" IN ('counterparty', 'description', 'contains')`))
        .addColumn('pattern', 'text', (col) => col.notNull())
        .addColumn('label', 'text', (col) => col.notNull().check(sql`char_length("label") <= 80`))
        .addColumn('appliesTo', 'text', (col) => col.notNull().check(sql`"appliesTo" IN ('out', 'in', 'any')`))
        .addColumn('isSample', 'boolean', (col) => col.notNull().defaultTo(false))
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();

    await sql`CREATE UNIQUE INDEX "CategoryRules_companyId_match_unique" ON "CategoryRules" ("companyId", "matchType", "pattern", "appliesTo") WHERE "deletedAt" IS NULL`.execute(
        db
    );
    await sql`CREATE INDEX "CategoryRules_companyId_categoryId_idx" ON "CategoryRules" ("companyId", "categoryId") WHERE "deletedAt" IS NULL`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('CategoryRules').execute();
}
