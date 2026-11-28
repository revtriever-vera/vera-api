import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('AssistantConversations')
        .addColumn('kind', 'text', (col) =>
            col
                .notNull()
                .defaultTo('chat')
                .check(sql`"kind" IN ('chat', 'onboarding')`)
        )
        .execute();
    await sql`CREATE UNIQUE INDEX "AssistantConversations_onboarding_per_company" ON "AssistantConversations" ("companyId") WHERE "kind" = 'onboarding'`.execute(
        db
    );
    await db.schema.alterTable('AssistantMessages').addColumn('payload', 'jsonb').execute();
    await sql`ALTER TABLE "AssistantMessages" DROP CONSTRAINT "AssistantMessages_role_check"`.execute(db);
    await sql`ALTER TABLE "AssistantMessages" ADD CONSTRAINT "AssistantMessages_role_check" CHECK ("role" IN ('person', 'vera', 'system'))`.execute(
        db
    );
    await db.schema.alterTable('OnboardingStates').addColumn('script', 'jsonb').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('OnboardingStates').dropColumn('script').execute();
    await sql`DELETE FROM "AssistantMessages" WHERE "role" = 'system'`.execute(db);
    await sql`ALTER TABLE "AssistantMessages" DROP CONSTRAINT "AssistantMessages_role_check"`.execute(db);
    await sql`ALTER TABLE "AssistantMessages" ADD CONSTRAINT "AssistantMessages_role_check" CHECK ("role" IN ('person', 'vera'))`.execute(
        db
    );
    await db.schema.alterTable('AssistantMessages').dropColumn('payload').execute();
    await sql`DROP INDEX "AssistantConversations_onboarding_per_company"`.execute(db);
    await db.schema.alterTable('AssistantConversations').dropColumn('kind').execute();
}
