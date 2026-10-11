import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('PluggyCredentials')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('sealed', 'text', (col) => col.notNull())
        .addColumn('sealerDriver', 'text', (col) => col.notNull().check(sql`"sealerDriver" IN ('kms', 'local')`))
        .addColumn('clientIdHint', 'text', (col) => col.notNull())
        .addColumn('status', 'text', (col) => col.notNull().check(sql`"status" IN ('valid', 'invalid')`))
        .addColumn('lastVerifiedAt', 'timestamptz', (col) => col.notNull())
        .addColumn('lastErrorCode', 'text')
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();

    await sql`CREATE UNIQUE INDEX "PluggyCredentials_companyId_unique" ON "PluggyCredentials" ("companyId") WHERE "deletedAt" IS NULL`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('PluggyCredentials').execute();
}
