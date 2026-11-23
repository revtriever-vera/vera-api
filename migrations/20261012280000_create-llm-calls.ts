import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('LlmCalls')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('task', 'text', (col) => col.notNull())
        .addColumn('feature', 'text', (col) => col.notNull().check(sql`"feature" IN ('ai', 'whatsapp')`))
        .addColumn('driver', 'text', (col) => col.notNull().check(sql`"driver" IN ('gateway', 'openai_compatible', 'mock')`))
        .addColumn('modelId', 'text', (col) => col.notNull())
        .addColumn('servedModelId', 'text')
        .addColumn('inputTokens', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('outputTokens', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('cacheReadTokens', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('costMicros', 'bigint', (col) =>
            col
                .notNull()
                .defaultTo(0)
                .check(sql`"costMicros" >= 0`)
        )
        .addColumn('gatewayCostMicros', 'bigint', (col) => col.check(sql`"gatewayCostMicros" >= 0`))
        .addColumn('latencyMs', 'integer', (col) => col.notNull())
        .addColumn('attempts', 'smallint', (col) => col.notNull())
        .addColumn('outcome', 'text', (col) =>
            col.notNull().check(sql`"outcome" IN ('answered', 'failed', 'invalid', 'cap_reached', 'disabled')`)
        )
        .addColumn('requestHash', 'text', (col) => col.notNull())
        .addColumn('referenceId', 'text')
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();
    await sql`CREATE INDEX "LlmCalls_company_created" ON "LlmCalls" ("companyId", "createdAt")`.execute(db);
    await sql`CREATE INDEX "LlmCalls_company_request_hash" ON "LlmCalls" ("companyId", "requestHash")`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('LlmCalls').execute();
}
