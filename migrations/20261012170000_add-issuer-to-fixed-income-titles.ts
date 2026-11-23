import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('FixedIncomeTitles').addColumn('issuerId', 'text').execute();
    await sql`CREATE INDEX "FixedIncomeTitles_companyId_issuerId_idx" ON "FixedIncomeTitles" ("companyId", "issuerId") WHERE "deletedAt" IS NULL`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`DROP INDEX "FixedIncomeTitles_companyId_issuerId_idx"`.execute(db);
    await db.schema.alterTable('FixedIncomeTitles').dropColumn('issuerId').execute();
}
