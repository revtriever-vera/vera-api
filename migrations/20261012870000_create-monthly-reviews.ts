import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('MonthlyReviews')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('month', 'text', (col) => col.notNull().check(sql`"month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`))
        .addColumn('payload', 'jsonb', (col) => col.notNull())
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();
    await sql`CREATE UNIQUE INDEX "MonthlyReviews_company_month_unique" ON "MonthlyReviews" ("companyId", "month") WHERE "deletedAt" IS NULL`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('MonthlyReviews').execute();
}
