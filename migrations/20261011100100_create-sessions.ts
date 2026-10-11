import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('Sessions')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('userId', 'uuid', (col) => col.notNull().references('Users.id').onDelete('cascade'))
        .addColumn('familyId', 'uuid', (col) => col.notNull())
        .addColumn('tokenHash', 'text', (col) => col.notNull().unique())
        .addColumn('replacedById', 'uuid')
        .addColumn('provider', 'text', (col) => col.notNull())
        .addColumn('expiresAt', 'timestamptz', (col) => col.notNull())
        .addColumn('revokedAt', 'timestamptz')
        .addColumn('ip', 'text')
        .addColumn('userAgent', 'text')
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();

    await db.schema.createIndex('Sessions_userId_idx').on('Sessions').column('userId').execute();
    await db.schema.createIndex('Sessions_familyId_idx').on('Sessions').column('familyId').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('Sessions').execute();
}
