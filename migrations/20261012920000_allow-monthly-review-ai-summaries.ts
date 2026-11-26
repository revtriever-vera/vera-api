import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE "AiSummaries" DROP CONSTRAINT "AiSummaries_kind_check"`.execute(db);
    await sql`ALTER TABLE "AiSummaries" ADD CONSTRAINT "AiSummaries_kind_check" CHECK ("kind" IN ('month', 'cuts', 'portfolio', 'monthly_review'))`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`DELETE FROM "AiSummaries" WHERE "kind" = 'monthly_review'`.execute(db);
    await sql`ALTER TABLE "AiSummaries" DROP CONSTRAINT "AiSummaries_kind_check"`.execute(db);
    await sql`ALTER TABLE "AiSummaries" ADD CONSTRAINT "AiSummaries_kind_check" CHECK ("kind" IN ('month', 'cuts', 'portfolio'))`.execute(
        db
    );
}
