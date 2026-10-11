import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('SpendingSettings')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('savingsGoalBps', 'integer', (col) =>
            col
                .notNull()
                .defaultTo(2000)
                .check(sql`"savingsGoalBps" BETWEEN 0 AND 9000`)
        )
        .addColumn('incomeMode', 'text', (col) =>
            col
                .notNull()
                .defaultTo('transactions')
                .check(sql`"incomeMode" IN ('transactions', 'declared')`)
        )
        .addColumn('declaredIncomeMinor', 'bigint', (col) => col.check(sql`"declaredIncomeMinor" > 0`))
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();

    await sql`CREATE UNIQUE INDEX "SpendingSettings_companyId_unique" ON "SpendingSettings" ("companyId") WHERE "deletedAt" IS NULL`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('SpendingSettings').execute();
}
