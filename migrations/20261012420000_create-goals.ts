import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('Goals')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('kind', 'text', (col) =>
            col.notNull().check(sql`"kind" IN ('emergency_reserve', 'travel', 'home_down_payment', 'other')`)
        )
        .addColumn('name', 'text', (col) => col.notNull().check(sql`char_length("name") BETWEEN 1 AND 60`))
        .addColumn('targetMinor', 'bigint', (col) => col.notNull().check(sql`"targetMinor" > 0`))
        .addColumn('targetDate', 'date', (col) => col.notNull())
        .addColumn('holderUserId', 'uuid', (col) => col.references('Users.id').onDelete('set null'))
        .addColumn('manualMinor', 'bigint', (col) =>
            col
                .notNull()
                .defaultTo(0)
                .check(sql`"manualMinor" >= 0`)
        )
        .addColumn('manualUpdatedAt', 'timestamptz')
        .addColumn('planStartMonth', 'date', (col) => col.notNull())
        .addColumn('planStartMinor', 'bigint', (col) => col.notNull())
        .addColumn('planMonths', 'integer', (col) => col.notNull().check(sql`"planMonths" >= 1`))
        .addColumn('monthStartMonth', 'date', (col) => col.notNull())
        .addColumn('monthStartMinor', 'bigint', (col) => col.notNull())
        .addColumn('isSample', 'boolean', (col) => col.notNull().defaultTo(false))
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();
    await sql`CREATE INDEX "Goals_company_date" ON "Goals" ("companyId", "targetDate") WHERE "deletedAt" IS NULL`.execute(db);
    await sql`CREATE INDEX "Goals_company_holder" ON "Goals" ("companyId", "holderUserId") WHERE "deletedAt" IS NULL`.execute(db);
    await sql`CREATE UNIQUE INDEX "Goals_emergency_reserve_per_holder" ON "Goals" ("companyId", (COALESCE("holderUserId", '00000000-0000-0000-0000-000000000000'::uuid))) WHERE "kind" = 'emergency_reserve' AND "deletedAt" IS NULL`.execute(
        db
    );

    await db.schema
        .createTable('GoalHoldings')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('goalId', 'uuid', (col) => col.notNull().references('Goals.id').onDelete('cascade'))
        .addColumn('holdingKind', 'text', (col) => col.notNull().check(sql`"holdingKind" IN ('position', 'fixed_income')`))
        .addColumn('holdingId', 'uuid', (col) => col.notNull())
        .addColumn('shareBps', 'integer', (col) => col.notNull().check(sql`"shareBps" BETWEEN 1 AND 10000`))
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();
    await sql`CREATE UNIQUE INDEX "GoalHoldings_goal_holding_unique" ON "GoalHoldings" ("goalId", "holdingKind", "holdingId") WHERE "deletedAt" IS NULL`.execute(
        db
    );
    await sql`CREATE INDEX "GoalHoldings_company_holding" ON "GoalHoldings" ("companyId", "holdingKind", "holdingId") WHERE "deletedAt" IS NULL`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('GoalHoldings').execute();
    await db.schema.dropTable('Goals').execute();
}
