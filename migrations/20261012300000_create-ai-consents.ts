import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('AiConsents')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('acceptedByUserId', 'uuid', (col) => col.references('Users.id').onDelete('set null'))
        .addColumn('noticeVersion', 'integer', (col) => col.notNull())
        .addColumn('source', 'text', (col) => col.notNull().check(sql`"source" IN ('summary_card', 'privacy_settings', 'whatsapp_link')`))
        .addColumn('grantedAt', 'timestamptz', (col) => col.notNull())
        .addColumn('revokedAt', 'timestamptz')
        .addColumn('revokedByUserId', 'uuid', (col) => col.references('Users.id').onDelete('set null'))
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();
    await sql`CREATE UNIQUE INDEX "AiConsents_companyId_unique" ON "AiConsents" ("companyId") WHERE "deletedAt" IS NULL`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('AiConsents').execute();
}
