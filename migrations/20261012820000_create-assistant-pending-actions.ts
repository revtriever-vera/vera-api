import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('AssistantPendingActions')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('userId', 'uuid', (col) => col.notNull().references('Users.id').onDelete('cascade'))
        .addColumn('conversationId', 'uuid', (col) => col.notNull().references('AssistantConversations.id').onDelete('cascade'))
        .addColumn('turnId', 'uuid', (col) => col.notNull().references('AssistantMessages.id').onDelete('cascade'))
        .addColumn('tool', 'text', (col) => col.notNull())
        .addColumn('summary', 'text', (col) => col.notNull())
        .addColumn('payload', 'jsonb', (col) => col.notNull())
        .addColumn('actionHash', 'text', (col) => col.notNull())
        .addColumn('stateHash', 'text', (col) => col.notNull())
        .addColumn('status', 'text', (col) => col.notNull().check(sql`"status" IN ('open', 'confirmed', 'canceled', 'expired', 'stale')`))
        .addColumn('resultText', 'text')
        .addColumn('expiresAt', 'timestamptz', (col) => col.notNull())
        .addColumn('resolvedAt', 'timestamptz')
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE UNIQUE INDEX "AssistantPendingActions_one_open_per_conversation" ON "AssistantPendingActions" ("companyId", "conversationId") WHERE "status" = 'open'`.execute(
        db
    );
    await sql`CREATE INDEX "AssistantPendingActions_company_turn" ON "AssistantPendingActions" ("companyId", "turnId")`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('AssistantPendingActions').execute();
}
