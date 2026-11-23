import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('AccountInvites')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('email', 'text', (col) => col.notNull())
        .addColumn('role', 'text', (col) => col.notNull())
        .addColumn('tokenHash', 'text', (col) => col.notNull().unique())
        .addColumn('invitedByUserId', 'uuid', (col) => col.references('Users.id').onDelete('set null'))
        .addColumn('expiresAt', 'timestamptz', (col) => col.notNull())
        .addColumn('lastSentAt', 'timestamptz', (col) => col.notNull())
        .addColumn('sendCount', 'integer', (col) => col.notNull().defaultTo(1))
        .addColumn('acceptedAt', 'timestamptz')
        .addColumn('acceptedUserId', 'uuid')
        .addColumn('revokedAt', 'timestamptz')
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();

    await sql`ALTER TABLE "AccountInvites" ADD CONSTRAINT "AccountInvites_role_check" CHECK ("role" IN ('owner','editor','viewer'))`.execute(
        db
    );
    await sql`CREATE UNIQUE INDEX "AccountInvites_pending_key" ON "AccountInvites" ("companyId", lower("email")) WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL AND "deletedAt" IS NULL`.execute(
        db
    );

    await db.schema.alterTable('Users').addColumn('removedAt', 'timestamptz').execute();
    await db.schema.alterTable('Users').addColumn('removedByUserId', 'uuid').execute();
    await sql`CREATE INDEX "Users_removedAt_idx" ON "Users" ("removedAt") WHERE "removedAt" IS NOT NULL`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`DROP INDEX "Users_removedAt_idx"`.execute(db);
    await db.schema.alterTable('Users').dropColumn('removedByUserId').execute();
    await db.schema.alterTable('Users').dropColumn('removedAt').execute();
    await db.schema.dropTable('AccountInvites').execute();
}
