import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE "Goals"
        ADD COLUMN "reserveMonths" smallint CHECK ("reserveMonths" IN (3, 6, 12)),
        ADD COLUMN "reserveBaseMinor" bigint CHECK ("reserveBaseMinor" > 0)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE "Goals" DROP COLUMN "reserveBaseMinor", DROP COLUMN "reserveMonths"`.execute(db);
}
