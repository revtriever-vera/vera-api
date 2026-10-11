import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('IndexSeriesPoints')
        .addColumn('series', 'text', (col) => col.notNull())
        .addColumn('date', 'date', (col) => col.notNull())
        .addColumn('value', sql`numeric(18,8)`, (col) => col.notNull())
        .addColumn('source', 'text', (col) => col.notNull())
        .addColumn('fetchedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addPrimaryKeyConstraint('IndexSeriesPoints_pkey', ['series', 'date'])
        .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('IndexSeriesPoints').execute();
}
