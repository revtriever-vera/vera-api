import { Kysely, sql } from 'kysely';

const PREMIUM_PRICE_CENTS: number = 1490;
const PAID_USAGE_CAP_MICROS: number = 4000000;

async function createCatalog(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('GlobalPlans')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
        .addColumn('key', 'text', (col) => col.notNull().unique())
        .addColumn('displayName', 'text', (col) => col.notNull())
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await db.schema
        .createTable('GlobalProducts')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
        .addColumn('key', 'text', (col) => col.notNull().unique())
        .addColumn('kind', 'text', (col) => col.notNull().check(sql`"kind" IN ('subscription', 'usage')`))
        .addColumn('displayName', 'text', (col) => col.notNull())
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await db.schema
        .createTable('GlobalPlanProducts')
        .addColumn('planId', 'uuid', (col) => col.notNull().references('GlobalPlans.id').onDelete('cascade'))
        .addColumn('productId', 'uuid', (col) => col.notNull().references('GlobalProducts.id').onDelete('cascade'))
        .addColumn('priceCents', 'bigint', (col) => col.notNull().check(sql`"priceCents" >= 0`))
        .addPrimaryKeyConstraint('GlobalPlanProducts_pkey', ['planId', 'productId'])
        .execute();
    await db.schema
        .createTable('GlobalPlanCapabilities')
        .addColumn('planId', 'uuid', (col) => col.notNull().references('GlobalPlans.id').onDelete('cascade'))
        .addColumn('capability', 'text', (col) => col.notNull().check(sql`"capability" IN ('ai', 'whatsapp', 'calendar')`))
        .addPrimaryKeyConstraint('GlobalPlanCapabilities_pkey', ['planId', 'capability'])
        .execute();
    await db.schema
        .createTable('GlobalProductLimits')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
        .addColumn('productId', 'uuid', (col) => col.notNull().references('GlobalProducts.id').onDelete('cascade'))
        .addColumn('unit', 'text', (col) => col.notNull())
        .addColumn('quantity', 'bigint', (col) => col.notNull().check(sql`"quantity" >= 0`))
        .addColumn('policy', 'text', (col) => col.notNull().check(sql`"policy" IN ('pause', 'allow')`))
        .addColumn('startsAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('endsAt', 'timestamptz')
        .execute();
    await sql`CREATE UNIQUE INDEX "GlobalProductLimits_open_unique" ON "GlobalProductLimits" ("productId", "unit") WHERE "endsAt" IS NULL`.execute(
        db
    );
}

async function createContracts(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('CompanyProducts')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('productId', 'uuid', (col) => col.notNull().references('GlobalProducts.id'))
        .addColumn('priceCents', 'bigint', (col) => col.notNull().check(sql`"priceCents" >= 0`))
        .addColumn('startsAt', 'timestamptz', (col) => col.notNull())
        .addColumn('endsAt', 'timestamptz')
        .addColumn('source', 'text', (col) => col.notNull().check(sql`"source" IN ('subscription', 'manual')`))
        .addColumn('subscriptionId', 'uuid')
        .addColumn('endReason', 'text')
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE UNIQUE INDEX "CompanyProducts_open_unique" ON "CompanyProducts" ("companyId", "productId") WHERE "endsAt" IS NULL`.execute(
        db
    );
    await db.schema
        .createTable('CompanyProductLimits')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('productId', 'uuid', (col) => col.notNull().references('GlobalProducts.id'))
        .addColumn('unit', 'text', (col) => col.notNull())
        .addColumn('quantity', 'bigint', (col) => col.notNull().check(sql`"quantity" >= 0`))
        .addColumn('policy', 'text', (col) => col.notNull().check(sql`"policy" IN ('pause', 'allow')`))
        .addColumn('startsAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('endsAt', 'timestamptz')
        .execute();
    await sql`CREATE UNIQUE INDEX "CompanyProductLimits_open_unique" ON "CompanyProductLimits" ("companyId", "productId", "unit") WHERE "endsAt" IS NULL`.execute(
        db
    );
    await db.schema
        .createTable('CompanyCapabilities')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('capability', 'text', (col) => col.notNull().check(sql`"capability" IN ('ai', 'whatsapp', 'calendar')`))
        .addColumn('origin', 'text', (col) => col.notNull().check(sql`"origin" = 'manual'`))
        .addColumn('granted', 'boolean', (col) => col.notNull())
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE UNIQUE INDEX "CompanyCapabilities_company_capability_unique" ON "CompanyCapabilities" ("companyId", "capability")`.execute(
        db
    );
    await db.schema
        .createTable('PremiumEndedNotifications')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('handler', 'text', (col) => col.notNull())
        .addColumn('contractEndsAt', 'timestamptz', (col) => col.notNull())
        .addColumn('status', 'text', (col) => col.notNull().check(sql`"status" IN ('pending', 'done', 'failed')`))
        .addColumn('attempts', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('lastError', 'text')
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE UNIQUE INDEX "PremiumEndedNotifications_unique" ON "PremiumEndedNotifications" ("companyId", "handler", "contractEndsAt")`.execute(
        db
    );
}

async function seedCatalog(db: Kysely<unknown>): Promise<void> {
    await sql`INSERT INTO "GlobalPlans" ("key", "displayName") VALUES ('free', 'Free'), ('premium', 'Premium')`.execute(db);
    await sql`INSERT INTO "GlobalProducts" ("key", "kind", "displayName")
        VALUES ('premium', 'subscription', 'Premium'), ('paid_usage', 'usage', 'Paid usage')`.execute(db);
    await sql`INSERT INTO "GlobalPlanProducts" ("planId", "productId", "priceCents")
        SELECT p."id", r."id", ${PREMIUM_PRICE_CENTS} FROM "GlobalPlans" p, "GlobalProducts" r WHERE p."key" = 'premium' AND r."key" = 'premium'`.execute(
        db
    );
    await sql`INSERT INTO "GlobalPlanCapabilities" ("planId", "capability")
        SELECT p."id", c."capability" FROM "GlobalPlans" p, (VALUES ('ai'), ('whatsapp'), ('calendar')) AS c ("capability") WHERE p."key" = 'premium'`.execute(
        db
    );
    await sql`INSERT INTO "GlobalProductLimits" ("productId", "unit", "quantity", "policy")
        SELECT "id", 'cost_micros', ${PAID_USAGE_CAP_MICROS}, 'pause' FROM "GlobalProducts" WHERE "key" = 'paid_usage'`.execute(db);
}

export async function up(db: Kysely<unknown>): Promise<void> {
    await createCatalog(db);
    await createContracts(db);
    await seedCatalog(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
    for (const table of [
        'PremiumEndedNotifications',
        'CompanyCapabilities',
        'CompanyProductLimits',
        'CompanyProducts',
        'GlobalProductLimits',
        'GlobalPlanCapabilities',
        'GlobalPlanProducts',
        'GlobalProducts',
        'GlobalPlans'
    ]) {
        await db.schema.dropTable(table).execute();
    }
}
