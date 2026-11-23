import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await createSubscriptions(db);
    await createInvoices(db);
    await createPriceQuotes(db);
    await createStandings(db);
    await createNotifications(db);
    await createRefundRequests(db);
    await createGlobalTables(db);
}

async function createSubscriptions(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('BillingSubscriptions')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('engine', 'text', (col) => col.notNull().check(sql`"engine" IN ('fake', 'revtriever')`))
        .addColumn('status', 'text', (col) => col.notNull().check(sql`"status" IN ('pending', 'active', 'failed', 'canceled')`))
        .addColumn('engineSubscriptionId', 'text')
        .addColumn('engineCustomerId', 'text')
        .addColumn('planId', 'text', (col) => col.notNull())
        .addColumn('paymentMethod', 'text', (col) => col.notNull().check(sql`"paymentMethod" IN ('card', 'pix')`))
        .addColumn('firstChargeDate', 'text')
        .addColumn('chargeDay', 'integer')
        .addColumn('paidThrough', 'timestamptz')
        .addColumn('firstPaidAt', 'timestamptz')
        .addColumn('cancelRequestedAt', 'timestamptz')
        .addColumn('canceledAt', 'timestamptz')
        .addColumn('cardBrand', 'text')
        .addColumn('cardLast4', 'text')
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE UNIQUE INDEX "BillingSubscriptions_company_engine_open_unique" ON "BillingSubscriptions" ("companyId", "engine") WHERE "status" IN ('pending', 'active')`.execute(
        db
    );
    await sql`CREATE INDEX "BillingSubscriptions_engine_subscription_idx" ON "BillingSubscriptions" ("engine", "engineSubscriptionId")`.execute(
        db
    );
    await sql`CREATE INDEX "BillingSubscriptions_company_status_idx" ON "BillingSubscriptions" ("companyId", "status")`.execute(db);
}

async function createInvoices(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('BillingInvoices')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('subscriptionId', 'uuid', (col) => col.notNull().references('BillingSubscriptions.id').onDelete('cascade'))
        .addColumn('engine', 'text', (col) => col.notNull())
        .addColumn('engineInvoiceId', 'text', (col) => col.notNull())
        .addColumn('status', 'text', (col) => col.notNull().check(sql`"status" IN ('issued', 'overdue', 'paid')`))
        .addColumn('totalCents', 'bigint')
        .addColumn('method', 'text')
        .addColumn('dueDate', 'timestamptz')
        .addColumn('cycleStart', 'timestamptz')
        .addColumn('cycleEnd', 'timestamptz')
        .addColumn('issuedAt', 'timestamptz')
        .addColumn('paidAt', 'timestamptz')
        .addColumn('overdueAt', 'timestamptz')
        .addColumn('chargeFailedAt', 'timestamptz')
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE UNIQUE INDEX "BillingInvoices_company_engine_invoice_unique" ON "BillingInvoices" ("companyId", "engine", "engineInvoiceId")`.execute(
        db
    );
    await sql`CREATE INDEX "BillingInvoices_company_status_idx" ON "BillingInvoices" ("companyId", "status")`.execute(db);
}

async function createPriceQuotes(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('BillingPriceQuotes')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('subscriptionId', 'uuid', (col) => col.notNull().references('BillingSubscriptions.id').onDelete('cascade'))
        .addColumn('productRef', 'text', (col) => col.notNull())
        .addColumn('cycle', 'integer', (col) => col.notNull())
        .addColumn('amountCents', 'bigint', (col) => col.notNull())
        .addColumn('description', 'text', (col) => col.notNull())
        .addColumn('requestCount', 'integer', (col) => col.notNull().defaultTo(1))
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE UNIQUE INDEX "BillingPriceQuotes_company_sub_product_cycle_unique" ON "BillingPriceQuotes" ("companyId", "subscriptionId", "productRef", "cycle")`.execute(
        db
    );
}

async function createStandings(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('CompanyBillingStandings')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('status', 'text', (col) => col.notNull().check(sql`"status" IN ('active', 'past_due', 'expired')`))
        .addColumn('reason', 'text', (col) =>
            col.notNull().check(sql`"reason" IN ('invoice_overdue', 'grace_expired', 'invoice_paid', 'canceled_period_ended', 'refunded')`)
        )
        .addColumn('startsAt', 'timestamptz', (col) => col.notNull())
        .addColumn('endsAt', 'timestamptz')
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE UNIQUE INDEX "CompanyBillingStandings_company_open_unique" ON "CompanyBillingStandings" ("companyId") WHERE "endsAt" IS NULL`.execute(
        db
    );
}

async function createNotifications(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('BillingNotifications')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('subjectId', 'text', (col) => col.notNull())
        .addColumn('kind', 'text', (col) => col.notNull())
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE UNIQUE INDEX "BillingNotifications_company_subject_kind_unique" ON "BillingNotifications" ("companyId", "subjectId", "kind")`.execute(
        db
    );
}

async function createRefundRequests(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('BillingRefundRequests')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('subscriptionId', 'uuid', (col) => col.notNull().references('BillingSubscriptions.id').onDelete('cascade'))
        .addColumn('requestedAt', 'timestamptz', (col) => col.notNull())
        .addColumn('doneAt', 'timestamptz')
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE UNIQUE INDEX "BillingRefundRequests_company_subscription_unique" ON "BillingRefundRequests" ("companyId", "subscriptionId")`.execute(
        db
    );
}

async function createGlobalTables(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('RevtrieverEvents')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('externalEventId', 'text', (col) => col.notNull().unique())
        .addColumn('type', 'text', (col) => col.notNull())
        .addColumn('payload', 'jsonb', (col) => col.notNull())
        .addColumn('status', 'text', (col) => col.notNull().check(sql`"status" IN ('received', 'processed', 'ignored', 'failed')`))
        .addColumn('receivedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('processedAt', 'timestamptz')
        .addColumn('error', 'text')
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE INDEX "RevtrieverEvents_status_received_idx" ON "RevtrieverEvents" ("status", "receivedAt")`.execute(db);
    await db.schema
        .createTable('RevtrieverEventCursors')
        .addColumn('source', 'text', (col) => col.primaryKey())
        .addColumn('cursor', 'text')
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await db.schema
        .createTable('BillingPendingCancellations')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('engineSubscriptionId', 'text', (col) => col.notNull().unique())
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
    for (const table of [
        'BillingPendingCancellations',
        'RevtrieverEventCursors',
        'RevtrieverEvents',
        'BillingRefundRequests',
        'BillingNotifications',
        'CompanyBillingStandings',
        'BillingPriceQuotes',
        'BillingInvoices',
        'BillingSubscriptions'
    ]) {
        await db.schema.dropTable(table).execute();
    }
}
