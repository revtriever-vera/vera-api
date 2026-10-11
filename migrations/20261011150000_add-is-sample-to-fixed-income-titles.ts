import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('FixedIncomeTitles')
        .addColumn('isSample', 'boolean', (col) => col.notNull().defaultTo(false))
        .execute();
    await sql`CREATE INDEX "FixedIncomeTitles_companyId_isSample_idx" ON "FixedIncomeTitles" ("companyId") WHERE "isSample" AND "deletedAt" IS NULL`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`DROP INDEX "FixedIncomeTitles_companyId_isSample_idx"`.execute(db);
    await db.schema.alterTable('FixedIncomeTitles').dropColumn('isSample').execute();
}
