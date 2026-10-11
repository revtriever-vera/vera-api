import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('AccountDeletionLog')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyHash', 'text', (col) => col.notNull())
        .addColumn('requestedAt', 'timestamptz', (col) => col.notNull())
        .addColumn('completedAt', 'timestamptz', (col) => col.notNull())
        .addColumn('areas', 'jsonb', (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();

    await db.schema.createIndex('AccountDeletionLog_companyHash_idx').on('AccountDeletionLog').column('companyHash').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('AccountDeletionLog').execute();
}
