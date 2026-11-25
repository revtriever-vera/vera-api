import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE "PaidUsageEntries" DROP CONSTRAINT "PaidUsageEntries_feature_check"`.execute(db);
    await sql`ALTER TABLE "PaidUsageEntries" ADD CONSTRAINT "PaidUsageEntries_feature_check" CHECK ("feature" IN ('ai', 'whatsapp', 'help'))`.execute(
        db
    );
    await sql`ALTER TABLE "LlmCalls" DROP CONSTRAINT "LlmCalls_feature_check"`.execute(db);
    await sql`ALTER TABLE "LlmCalls" ADD CONSTRAINT "LlmCalls_feature_check" CHECK ("feature" IN ('ai', 'whatsapp', 'help'))`.execute(db);
    await db.schema
        .createTable('AssistantConversations')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('userId', 'uuid', (col) => col.notNull().references('Users.id').onDelete('cascade'))
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('lastMessageAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE INDEX "AssistantConversations_company_user_last" ON "AssistantConversations" ("companyId", "userId", "lastMessageAt" DESC)`.execute(
        db
    );
    await sql`CREATE INDEX "AssistantConversations_last" ON "AssistantConversations" ("lastMessageAt")`.execute(db);
    await db.schema
        .createTable('AssistantMessages')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('conversationId', 'uuid', (col) => col.notNull().references('AssistantConversations.id').onDelete('cascade'))
        .addColumn('role', 'text', (col) => col.notNull().check(sql`"role" IN ('person', 'vera')`))
        .addColumn('text', 'text', (col) => col.notNull().defaultTo(''))
        .addColumn('status', 'text', (col) => col.notNull().check(sql`"status" IN ('pending', 'done', 'failed')`))
        .addColumn('toolsUsed', 'jsonb', (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
        .addColumn('sent', 'jsonb')
        .addColumn('mode', 'text', (col) => col.check(sql`"mode" IN ('help', 'ai')`))
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE INDEX "AssistantMessages_company_conversation_created" ON "AssistantMessages" ("companyId", "conversationId", "createdAt")`.execute(
        db
    );
    await sql`CREATE INDEX "AssistantMessages_created" ON "AssistantMessages" ("createdAt")`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('AssistantMessages').execute();
    await db.schema.dropTable('AssistantConversations').execute();
    await sql`ALTER TABLE "LlmCalls" DROP CONSTRAINT "LlmCalls_feature_check"`.execute(db);
    await sql`ALTER TABLE "LlmCalls" ADD CONSTRAINT "LlmCalls_feature_check" CHECK ("feature" IN ('ai', 'whatsapp'))`.execute(db);
    await sql`ALTER TABLE "PaidUsageEntries" DROP CONSTRAINT "PaidUsageEntries_feature_check"`.execute(db);
    await sql`ALTER TABLE "PaidUsageEntries" ADD CONSTRAINT "PaidUsageEntries_feature_check" CHECK ("feature" IN ('ai', 'whatsapp'))`.execute(
        db
    );
}
