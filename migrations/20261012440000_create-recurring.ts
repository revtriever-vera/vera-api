import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('RecurringSeries')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('accountId', 'uuid', (col) => col.notNull().references('FinancialAccounts.id').onDelete('cascade'))
        .addColumn('name', 'text', (col) => col.notNull().check(sql`char_length("name") BETWEEN 1 AND 80`))
        .addColumn('merchantKey', 'text', (col) => col.notNull())
        .addColumn('cadence', 'text', (col) =>
            col.notNull().check(sql`"cadence" IN ('weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual')`)
        )
        .addColumn('valueMode', 'text', (col) => col.notNull().check(sql`"valueMode" IN ('fixed', 'variable')`))
        .addColumn('kind', 'text', (col) => col.notNull().check(sql`"kind" IN ('subscription', 'bill', 'other')`))
        .addColumn('status', 'text', (col) => col.notNull().check(sql`"status" IN ('suggested', 'confirmed', 'dismissed', 'stopped')`))
        .addColumn('origin', 'text', (col) => col.notNull().check(sql`"origin" IN ('detected', 'manual')`))
        .addColumn('typicalAmountMinor', 'bigint', (col) => col.notNull().check(sql`"typicalAmountMinor" > 0`))
        .addColumn('minAmountMinor', 'bigint', (col) => col.notNull().check(sql`"minAmountMinor" > 0`))
        .addColumn('maxAmountMinor', 'bigint', (col) => col.notNull().check(sql`"maxAmountMinor" > 0`))
        .addColumn('expectedDay', 'integer', (col) => col.check(sql`"expectedDay" BETWEEN 1 AND 31`))
        .addColumn('dayChangeFrom', 'integer')
        .addColumn('dayChangeTo', 'integer')
        .addColumn('knownSubscription', 'boolean', (col) => col.notNull().defaultTo(false))
        .addColumn('firstDate', 'date', (col) => col.notNull())
        .addColumn('lastDate', 'date', (col) => col.notNull())
        .addColumn('snoozedUntil', 'date')
        .addColumn('confirmedAt', 'timestamptz')
        .addColumn('dismissedAt', 'timestamptz')
        .addColumn('stoppedAt', 'timestamptz')
        .addColumn('stoppedBy', 'text', (col) => col.check(sql`"stoppedBy" IN ('user', 'auto')`))
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();
    await sql`CREATE INDEX "RecurringSeries_company_status" ON "RecurringSeries" ("companyId", "status") WHERE "deletedAt" IS NULL`.execute(
        db
    );
    await sql`CREATE INDEX "RecurringSeries_company_merchant" ON "RecurringSeries" ("companyId", "merchantKey") WHERE "deletedAt" IS NULL`.execute(
        db
    );

    await db.schema
        .createTable('RecurringCharges')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('seriesId', 'uuid', (col) => col.notNull().references('RecurringSeries.id').onDelete('cascade'))
        .addColumn('transactionId', 'uuid', (col) => col.notNull().references('Transactions.id').onDelete('cascade'))
        .addColumn('role', 'text', (col) => col.notNull().check(sql`"role" IN ('charge', 'duplicate', 'trial', 'excluded')`))
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();
    await sql`CREATE UNIQUE INDEX "RecurringCharges_series_transaction_unique" ON "RecurringCharges" ("seriesId", "transactionId") WHERE "deletedAt" IS NULL`.execute(
        db
    );
    await sql`CREATE INDEX "RecurringCharges_company_transaction" ON "RecurringCharges" ("companyId", "transactionId") WHERE "deletedAt" IS NULL`.execute(
        db
    );
    await sql`CREATE INDEX "RecurringCharges_company_series" ON "RecurringCharges" ("companyId", "seriesId") WHERE "deletedAt" IS NULL`.execute(
        db
    );

    await db.schema
        .createTable('RecurringSuppressions')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('seriesId', 'uuid', (col) => col.references('RecurringSeries.id').onDelete('set null'))
        .addColumn('merchantKey', 'text', (col) => col.notNull())
        .addColumn('typicalAmountMinor', 'bigint', (col) => col.notNull().check(sql`"typicalAmountMinor" > 0`))
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();
    await sql`CREATE INDEX "RecurringSuppressions_company_merchant" ON "RecurringSuppressions" ("companyId", "merchantKey") WHERE "deletedAt" IS NULL`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('RecurringSuppressions').execute();
    await db.schema.dropTable('RecurringCharges').execute();
    await db.schema.dropTable('RecurringSeries').execute();
}
