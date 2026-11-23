import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('GoalNoticeMarks')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('goalId', 'uuid', (col) => col.notNull().references('Goals.id').onDelete('cascade'))
        .addColumn('month', 'text', (col) => col.notNull().check(sql`"month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`))
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();
    await sql`CREATE UNIQUE INDEX "GoalNoticeMarks_company_goal_month_unique" ON "GoalNoticeMarks" ("companyId", "goalId", "month")`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('GoalNoticeMarks').execute();
}
