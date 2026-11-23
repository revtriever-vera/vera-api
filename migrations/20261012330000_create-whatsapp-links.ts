import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('WhatsAppLinks')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('userId', 'uuid', (col) => col.notNull().references('Users.id').onDelete('cascade'))
        .addColumn('phoneSealed', 'jsonb', (col) => col.notNull())
        .addColumn('phoneHash', 'text', (col) => col.notNull())
        .addColumn('phoneLast4', 'text', (col) => col.notNull())
        .addColumn('status', 'text', (col) => col.notNull().check(sql`"status" IN ('active', 'unlinked', 'suspended')`))
        .addColumn('optInAt', 'timestamptz', (col) => col.notNull())
        .addColumn('optInSource', 'text', (col) => col.notNull().check(sql`"optInSource" IN ('user_message')`))
        .addColumn('linkedAt', 'timestamptz', (col) => col.notNull())
        .addColumn('unlinkedAt', 'timestamptz')
        .addColumn('unlinkReason', 'text', (col) =>
            col.check(
                sql`"unlinkReason" IN ('user_app', 'user_chat', 'opt_out', 'premium_ended', 'member_removed', 'account_deleted', 'stale')`
            )
        )
        .addColumn('lastInboundAt', 'timestamptz')
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();
    await sql`CREATE UNIQUE INDEX "WhatsAppLinks_active_phone_unique" ON "WhatsAppLinks" ("phoneHash") WHERE "status" = 'active' AND "deletedAt" IS NULL`.execute(
        db
    );
    await sql`CREATE UNIQUE INDEX "WhatsAppLinks_active_user_unique" ON "WhatsAppLinks" ("companyId", "userId") WHERE "status" = 'active' AND "deletedAt" IS NULL`.execute(
        db
    );
    await sql`CREATE INDEX "WhatsAppLinks_company_status" ON "WhatsAppLinks" ("companyId", "status")`.execute(db);
    await sql`CREATE INDEX "WhatsAppLinks_active_last_inbound" ON "WhatsAppLinks" ("lastInboundAt") WHERE "status" = 'active'`.execute(db);

    await db.schema
        .createTable('WhatsAppLinkCodes')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('userId', 'uuid', (col) => col.notNull().references('Users.id').onDelete('cascade'))
        .addColumn('codeHash', 'text', (col) => col.notNull())
        .addColumn('expiresAt', 'timestamptz', (col) => col.notNull())
        .addColumn('usedAt', 'timestamptz')
        .addColumn('canceledAt', 'timestamptz')
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE UNIQUE INDEX "WhatsAppLinkCodes_code_hash_unique" ON "WhatsAppLinkCodes" ("codeHash")`.execute(db);
    await sql`CREATE UNIQUE INDEX "WhatsAppLinkCodes_pending_user_unique" ON "WhatsAppLinkCodes" ("companyId", "userId") WHERE "usedAt" IS NULL AND "canceledAt" IS NULL`.execute(
        db
    );

    await sql`ALTER TABLE "WhatsAppMessages" ADD COLUMN "linkId" uuid REFERENCES "WhatsAppLinks"("id") ON DELETE SET NULL`.execute(db);
    await sql`CREATE INDEX "WhatsAppMessages_company_link" ON "WhatsAppMessages" ("companyId", "linkId") WHERE "linkId" IS NOT NULL`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`DROP INDEX "WhatsAppMessages_company_link"`.execute(db);
    await sql`ALTER TABLE "WhatsAppMessages" DROP COLUMN "linkId"`.execute(db);
    await db.schema.dropTable('WhatsAppLinkCodes').execute();
    await db.schema.dropTable('WhatsAppLinks').execute();
}
