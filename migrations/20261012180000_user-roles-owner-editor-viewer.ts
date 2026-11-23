import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`UPDATE "Users" SET "role" = 'editor' WHERE "role" = 'member'`.execute(db);
    await sql`ALTER TABLE "Users" ADD CONSTRAINT "Users_role_check" CHECK ("role" IN ('owner','editor','viewer'))`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE "Users" DROP CONSTRAINT "Users_role_check"`.execute(db);
}
