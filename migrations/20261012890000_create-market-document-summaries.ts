import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE "LlmCalls" ALTER COLUMN "companyId" DROP NOT NULL`.execute(db);
    await sql`ALTER TABLE "LlmCalls" DROP CONSTRAINT "LlmCalls_feature_check"`.execute(db);
    await sql`ALTER TABLE "LlmCalls" ADD CONSTRAINT "LlmCalls_feature_check" CHECK ("feature" IN ('ai', 'whatsapp', 'help', 'market_docs'))`.execute(
        db
    );
    await sql`ALTER TABLE "LlmCalls" ADD CONSTRAINT "LlmCalls_platform_feature_check" CHECK ("companyId" IS NOT NULL OR "feature" = 'market_docs')`.execute(
        db
    );
    await sql`CREATE INDEX "LlmCalls_platform_feature_created" ON "LlmCalls" ("feature", "createdAt") WHERE "companyId" IS NULL`.execute(
        db
    );

    await db.schema
        .createTable('MarketDocumentSummaries')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('documentId', 'uuid', (col) => col.notNull().references('MarketDocuments.id').onDelete('cascade'))
        .addColumn('locale', 'text', (col) => col.notNull().check(sql`"locale" IN ('pt-BR', 'en')`))
        .addColumn('promptVersion', 'text', (col) => col.notNull())
        .addColumn('summary', 'text', (col) => col.notNull())
        .addColumn('kind', 'text', (col) =>
            col.notNull().check(sql`"kind" IN ('result', 'income', 'relevant_fact', 'meeting', 'management', 'routine')`)
        )
        .addColumn('relevance', 'smallint', (col) => col.notNull().check(sql`"relevance" BETWEEN 0 AND 3`))
        .addColumn('discard', 'boolean', (col) => col.notNull())
        .addColumn('llmCallId', 'uuid', (col) => col.references('LlmCalls.id').onDelete('set null'))
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE UNIQUE INDEX "MarketDocumentSummaries_documentId_locale_key" ON "MarketDocumentSummaries" ("documentId", "locale")`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('MarketDocumentSummaries').execute();
    await sql`DROP INDEX "LlmCalls_platform_feature_created"`.execute(db);
    await sql`DELETE FROM "LlmCalls" WHERE "companyId" IS NULL`.execute(db);
    await sql`ALTER TABLE "LlmCalls" DROP CONSTRAINT "LlmCalls_platform_feature_check"`.execute(db);
    await sql`ALTER TABLE "LlmCalls" DROP CONSTRAINT "LlmCalls_feature_check"`.execute(db);
    await sql`ALTER TABLE "LlmCalls" ADD CONSTRAINT "LlmCalls_feature_check" CHECK ("feature" IN ('ai', 'whatsapp', 'help'))`.execute(db);
    await sql`ALTER TABLE "LlmCalls" ALTER COLUMN "companyId" SET NOT NULL`.execute(db);
}
