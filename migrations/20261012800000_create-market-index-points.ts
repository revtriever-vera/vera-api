import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('MarketIndexPoints')
        .addColumn('symbol', 'text', (col) => col.notNull())
        .addColumn('date', 'date', (col) => col.notNull())
        .addColumn('close', sql`numeric(18,4)`, (col) => col.notNull())
        .addColumn('source', 'text', (col) => col.notNull())
        .addColumn('fetchedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addPrimaryKeyConstraint('MarketIndexPoints_pkey', ['symbol', 'date'])
        .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('MarketIndexPoints').execute();
}
