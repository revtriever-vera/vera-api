import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('OnboardingStates')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('startedAt', 'timestamptz')
        .addColumn('assetsDoneAt', 'timestamptz')
        .addColumn('assetsSkippedAt', 'timestamptz')
        .addColumn('banksDoneAt', 'timestamptz')
        .addColumn('banksSkippedAt', 'timestamptz')
        .addColumn('completedAt', 'timestamptz')
        .addColumn('dismissedAt', 'timestamptz')
        .addColumn('sampleLoadedAt', 'timestamptz')
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .addCheckConstraint('OnboardingStates_assets_exclusive', sql`NOT ("assetsDoneAt" IS NOT NULL AND "assetsSkippedAt" IS NOT NULL)`)
        .addCheckConstraint('OnboardingStates_banks_exclusive', sql`NOT ("banksDoneAt" IS NOT NULL AND "banksSkippedAt" IS NOT NULL)`)
        .addCheckConstraint('OnboardingStates_closed_exclusive', sql`NOT ("completedAt" IS NOT NULL AND "dismissedAt" IS NOT NULL)`)
        .execute();

    await sql`CREATE UNIQUE INDEX "OnboardingStates_companyId_unique" ON "OnboardingStates" ("companyId") WHERE "deletedAt" IS NULL`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('OnboardingStates').execute();
}
