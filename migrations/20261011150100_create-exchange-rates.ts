import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('ExchangeRates')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('currency', sql`char(3)`, (col) => col.notNull())
        .addColumn('date', 'date', (col) => col.notNull())
        .addColumn('brlPerUnit', sql`numeric(20, 10)`, (col) => col.notNull())
        .addColumn('source', 'text', (col) => col.notNull())
        .addColumn('fetchedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE UNIQUE INDEX "ExchangeRates_currency_date_key" ON "ExchangeRates" ("currency", "date")`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('ExchangeRates').execute();
}
