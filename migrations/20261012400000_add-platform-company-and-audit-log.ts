import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('Companies')
        .addColumn('isPlatform', 'boolean', (col) => col.notNull().defaultTo(false))
        .execute();
    await sql`CREATE UNIQUE INDEX "Companies_single_platform" ON "Companies" ("isPlatform") WHERE "isPlatform" = true AND "deletedAt" IS NULL`.execute(
        db
    );

    await db.schema
        .createTable('PlatformAuditLog')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('operatorUserId', 'uuid', (col) => col.references('Users.id').onDelete('set null'))
        .addColumn('action', 'text', (col) => col.notNull())
        .addColumn('targetCompanyId', 'uuid')
        .addColumn('meta', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE INDEX "PlatformAuditLog_created" ON "PlatformAuditLog" ("createdAt" DESC)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('PlatformAuditLog').execute();
    await sql`DROP INDEX "Companies_single_platform"`.execute(db);
    await db.schema.alterTable('Companies').dropColumn('isPlatform').execute();
}
