import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('Throttles')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('key', 'text', (col) => col.notNull().unique())
        .addColumn('windowStartedAt', 'timestamptz', (col) => col.notNull())
        .addColumn('count', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('Throttles').execute();
}
