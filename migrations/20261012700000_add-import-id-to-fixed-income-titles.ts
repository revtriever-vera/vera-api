import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE "FixedIncomeTitles" ADD COLUMN "importId" uuid NULL REFERENCES "InvestmentImports"("id") ON DELETE SET NULL`.execute(
        db
    );
    await sql`CREATE INDEX "FixedIncomeTitles_companyId_importId_idx" ON "FixedIncomeTitles" ("companyId", "importId") WHERE "importId" IS NOT NULL AND "deletedAt" IS NULL`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`DROP INDEX "FixedIncomeTitles_companyId_importId_idx"`.execute(db);
    await sql`ALTER TABLE "FixedIncomeTitles" DROP COLUMN "importId"`.execute(db);
}
