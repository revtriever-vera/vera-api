import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('PlatformAccessTokens')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('name', 'text', (col) => col.notNull())
        .addColumn('tokenHash', 'text', (col) => col.notNull())
        .addColumn('tokenHint', 'text', (col) => col.notNull())
        .addColumn('createdByUserId', 'uuid', (col) => col.notNull().references('Users.id').onDelete('cascade'))
        .addColumn('expiresAt', 'timestamptz', (col) => col.notNull())
        .addColumn('lastUsedAt', 'timestamptz')
        .addColumn('revokedAt', 'timestamptz')
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE UNIQUE INDEX "PlatformAccessTokens_hash" ON "PlatformAccessTokens" ("tokenHash")`.execute(db);
    await sql`CREATE INDEX "PlatformAccessTokens_created" ON "PlatformAccessTokens" ("createdAt" DESC)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('PlatformAccessTokens').execute();
}
