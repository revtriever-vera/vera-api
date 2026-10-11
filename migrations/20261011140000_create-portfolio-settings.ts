import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('PortfolioSettings')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('baseCurrency', sql`char(3)`, (col) =>
            col
                .notNull()
                .defaultTo('BRL')
                .check(sql`"baseCurrency" IN ('BRL', 'USD')`)
        )
        .addColumn('toleranceBps', 'integer', (col) =>
            col
                .notNull()
                .defaultTo(500)
                .check(sql`"toleranceBps" BETWEEN 0 AND 2000`)
        )
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();

    await sql`CREATE UNIQUE INDEX "PortfolioSettings_companyId_unique" ON "PortfolioSettings" ("companyId") WHERE "deletedAt" IS NULL`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('PortfolioSettings').execute();
}
