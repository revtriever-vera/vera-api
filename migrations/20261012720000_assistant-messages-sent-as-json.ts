import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE "AssistantMessages" ALTER COLUMN "sent" TYPE json USING "sent"::json`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE "AssistantMessages" ALTER COLUMN "sent" TYPE jsonb USING "sent"::jsonb`.execute(db);
}
