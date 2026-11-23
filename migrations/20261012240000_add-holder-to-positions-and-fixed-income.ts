import { Kysely, sql } from 'kysely';

const NO_HOLDER_KEY: string = '00000000-0000-0000-0000-000000000000';

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE "Positions" ADD COLUMN "holderUserId" uuid NULL REFERENCES "Users"("id") ON DELETE SET NULL`.execute(db);
    await sql`ALTER TABLE "FixedIncomeTitles" ADD COLUMN "holderUserId" uuid NULL REFERENCES "Users"("id") ON DELETE SET NULL`.execute(db);
    await sql`DROP INDEX "Positions_companyId_assetId_unique"`.execute(db);
    await sql`CREATE UNIQUE INDEX "Positions_companyId_assetId_holder_unique" ON "Positions" ("companyId", "assetId", (COALESCE("holderUserId", ${sql.lit(NO_HOLDER_KEY)}::uuid))) WHERE "deletedAt" IS NULL`.execute(
        db
    );
    await sql`CREATE INDEX "Positions_companyId_holderUserId_idx" ON "Positions" ("companyId", "holderUserId") WHERE "deletedAt" IS NULL`.execute(
        db
    );
    await sql`CREATE INDEX "FixedIncomeTitles_companyId_holderUserId_idx" ON "FixedIncomeTitles" ("companyId", "holderUserId") WHERE "deletedAt" IS NULL`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`DROP INDEX "FixedIncomeTitles_companyId_holderUserId_idx"`.execute(db);
    await sql`DROP INDEX "Positions_companyId_holderUserId_idx"`.execute(db);
    await sql`DROP INDEX "Positions_companyId_assetId_holder_unique"`.execute(db);
    await sql`CREATE UNIQUE INDEX "Positions_companyId_assetId_unique" ON "Positions" ("companyId", "assetId") WHERE "deletedAt" IS NULL`.execute(
        db
    );
    await sql`ALTER TABLE "FixedIncomeTitles" DROP COLUMN "holderUserId"`.execute(db);
    await sql`ALTER TABLE "Positions" DROP COLUMN "holderUserId"`.execute(db);
}
