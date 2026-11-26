import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('PortfolioMonthlySnapshots')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('month', 'text', (col) => col.notNull().check(sql`"month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`))
        .addColumn('assetId', 'uuid', (col) => col.notNull())
        .addColumn('holdingKind', 'text', (col) => col.notNull().check(sql`"holdingKind" IN ('position', 'fixed_income')`))
        .addColumn('classId', 'uuid')
        .addColumn('quantity', sql`numeric(28,10)`)
        .addColumn('price', sql`numeric(24,8)`)
        .addColumn('priceDate', 'date')
        .addColumn('valueMinor', 'bigint', (col) => col.notNull())
        .addColumn('currency', 'text', (col) => col.notNull())
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();
    await sql`CREATE UNIQUE INDEX "PortfolioMonthlySnapshots_company_month_asset_unique" ON "PortfolioMonthlySnapshots" ("companyId", "month", "assetId") WHERE "deletedAt" IS NULL`.execute(
        db
    );

    await db.schema
        .createTable('PortfolioIncomeLedger')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('eventId', 'uuid', (col) => col.notNull())
        .addColumn('assetId', 'uuid', (col) => col.notNull())
        .addColumn('quantityAtExDate', sql`numeric(28,10)`, (col) => col.notNull().check(sql`"quantityAtExDate" > 0`))
        .addColumn('amountMinor', 'bigint', (col) => col.notNull())
        .addColumn('currency', 'text', (col) => col.notNull())
        .addColumn('paymentDate', 'date')
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();
    await sql`CREATE UNIQUE INDEX "PortfolioIncomeLedger_company_event_unique" ON "PortfolioIncomeLedger" ("companyId", "eventId") WHERE "deletedAt" IS NULL`.execute(
        db
    );
    await sql`CREATE INDEX "PortfolioIncomeLedger_company_paymentDate_idx" ON "PortfolioIncomeLedger" ("companyId", "paymentDate") WHERE "deletedAt" IS NULL`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('PortfolioIncomeLedger').execute();
    await db.schema.dropTable('PortfolioMonthlySnapshots').execute();
}
