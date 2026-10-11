import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('SpendingCategories')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('systemKey', 'text')
        .addColumn('name', 'text')
        .addColumn('kind', 'text', (col) => col.notNull().check(sql`"kind" IN ('expense', 'income', 'transfer')`))
        .addColumn('flexibility', 'text', (col) => col.check(sql`"flexibility" IN ('fixed', 'flexible')`))
        .addColumn('icon', 'text', (col) => col.notNull())
        .addColumn('position', 'smallint', (col) => col.notNull())
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .addCheckConstraint(
            'SpendingCategories_flexibility_matches_kind',
            sql`(("kind" = 'expense') AND ("flexibility" IS NOT NULL)) OR (("kind" <> 'expense') AND ("flexibility" IS NULL))`
        )
        .execute();

    await sql`CREATE UNIQUE INDEX "SpendingCategories_companyId_systemKey_unique" ON "SpendingCategories" ("companyId", "systemKey") WHERE "systemKey" IS NOT NULL AND "deletedAt" IS NULL`.execute(
        db
    );
    await sql`CREATE UNIQUE INDEX "SpendingCategories_companyId_name_unique" ON "SpendingCategories" ("companyId", lower("name")) WHERE "name" IS NOT NULL AND "deletedAt" IS NULL`.execute(
        db
    );
    await sql`CREATE INDEX "SpendingCategories_companyId_position_idx" ON "SpendingCategories" ("companyId", "position") WHERE "deletedAt" IS NULL`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('SpendingCategories').execute();
}
