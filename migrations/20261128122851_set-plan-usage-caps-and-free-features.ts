import { Kysely, sql } from 'kysely';

const FREE_CAP_MICROS: number = 5000000;
const PREMIUM_CAP_MICROS: number = 10000000;
const PREVIOUS_CAP_MICROS: number = 4000000;

async function addPlanToLimits(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('GlobalProductLimits')
        .addColumn('planId', 'uuid', (col) => col.references('GlobalPlans.id').onDelete('cascade'))
        .execute();
    await sql`UPDATE "GlobalProductLimits" l SET "planId" = p."id" FROM "GlobalPlans" p WHERE p."key" = 'premium' AND l."planId" IS NULL`.execute(
        db
    );
    await db.schema
        .alterTable('GlobalProductLimits')
        .alterColumn('planId', (col) => col.setNotNull())
        .execute();
    await sql`DROP INDEX "GlobalProductLimits_open_unique"`.execute(db);
    await sql`CREATE UNIQUE INDEX "GlobalProductLimits_open_unique" ON "GlobalProductLimits" ("planId", "productId", "unit") WHERE "endsAt" IS NULL`.execute(
        db
    );
}

async function seedPlanCaps(db: Kysely<unknown>): Promise<void> {
    await sql`UPDATE "GlobalProductLimits" l SET "quantity" = ${PREMIUM_CAP_MICROS}
        FROM "GlobalPlans" p, "GlobalProducts" r
        WHERE l."planId" = p."id" AND l."productId" = r."id" AND p."key" = 'premium' AND r."key" = 'paid_usage'
        AND l."unit" = 'cost_micros' AND l."endsAt" IS NULL`.execute(db);
    await sql`INSERT INTO "GlobalProductLimits" ("planId", "productId", "unit", "quantity", "policy")
        SELECT p."id", r."id", 'cost_micros', ${FREE_CAP_MICROS}, 'pause' FROM "GlobalPlans" p, "GlobalProducts" r
        WHERE p."key" = 'free' AND r."key" = 'paid_usage'
        ON CONFLICT ("planId", "productId", "unit") WHERE "endsAt" IS NULL DO UPDATE SET "quantity" = EXCLUDED."quantity"`.execute(db);
}

async function seedPlanCapabilities(db: Kysely<unknown>): Promise<void> {
    await sql`INSERT INTO "GlobalPlanCapabilities" ("planId", "capability")
        SELECT p."id", c."capability" FROM "GlobalPlans" p, (VALUES ('ai'), ('calendar')) AS c ("capability") WHERE p."key" = 'free'
        ON CONFLICT DO NOTHING`.execute(db);
    await sql`INSERT INTO "GlobalPlanCapabilities" ("planId", "capability")
        SELECT p."id", c."capability" FROM "GlobalPlans" p, (VALUES ('ai'), ('whatsapp'), ('calendar')) AS c ("capability") WHERE p."key" = 'premium'
        ON CONFLICT DO NOTHING`.execute(db);
}

export async function up(db: Kysely<unknown>): Promise<void> {
    await addPlanToLimits(db);
    await seedPlanCaps(db);
    await seedPlanCapabilities(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`DELETE FROM "GlobalPlanCapabilities" c USING "GlobalPlans" p
        WHERE c."planId" = p."id" AND p."key" = 'free' AND c."capability" IN ('ai', 'calendar')`.execute(db);
    await sql`DELETE FROM "GlobalProductLimits" l USING "GlobalPlans" p WHERE l."planId" = p."id" AND p."key" = 'free'`.execute(db);
    await sql`UPDATE "GlobalProductLimits" SET "quantity" = ${PREVIOUS_CAP_MICROS} WHERE "unit" = 'cost_micros' AND "endsAt" IS NULL`.execute(
        db
    );
    await sql`DROP INDEX "GlobalProductLimits_open_unique"`.execute(db);
    await sql`CREATE UNIQUE INDEX "GlobalProductLimits_open_unique" ON "GlobalProductLimits" ("productId", "unit") WHERE "endsAt" IS NULL`.execute(
        db
    );
    await db.schema.alterTable('GlobalProductLimits').dropColumn('planId').execute();
}
