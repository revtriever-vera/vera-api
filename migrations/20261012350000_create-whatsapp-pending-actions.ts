import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('WhatsAppPendingActions')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('linkId', 'uuid', (col) => col.notNull().references('WhatsAppLinks.id').onDelete('cascade'))
        .addColumn('kind', 'text', (col) => col.notNull().check(sql`"kind" IN ('calendar_create', 'reminder_create', 'reminder_delete')`))
        .addColumn('payload', 'jsonb', (col) => col.notNull())
        .addColumn('expiresAt', 'timestamptz', (col) => col.notNull())
        .addColumn('resolvedAt', 'timestamptz')
        .addColumn('resolution', 'text', (col) => col.check(sql`"resolution" IN ('confirmed', 'canceled', 'expired')`))
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE INDEX "WhatsAppPendingActions_company_link_created" ON "WhatsAppPendingActions" ("companyId", "linkId", "createdAt")`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('WhatsAppPendingActions').execute();
}
