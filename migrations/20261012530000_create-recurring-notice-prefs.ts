import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('RecurringNoticePrefs')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('userId', 'uuid', (col) => col.notNull().references('Users.id').onDelete('cascade'))
        .addColumn('seriesId', 'uuid', (col) => col.notNull().references('RecurringSeries.id').onDelete('cascade'))
        .addColumn('enabled', 'boolean', (col) => col.notNull())
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();
    await sql`CREATE UNIQUE INDEX "RecurringNoticePrefs_company_user_series_unique" ON "RecurringNoticePrefs" ("companyId", "userId", "seriesId")`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('RecurringNoticePrefs').execute();
}
