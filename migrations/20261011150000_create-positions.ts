import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('Positions')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('assetId', 'uuid', (col) => col.notNull().references('Assets.id'))
        .addColumn('quantity', sql`numeric(28,10)`, (col) => col.notNull().check(sql`"quantity" >= 0`))
        .addColumn('averagePrice', sql`numeric(24,8)`, (col) => col.check(sql`"averagePrice" IS NULL OR "averagePrice" >= 0`))
        .addColumn('isSample', 'boolean', (col) => col.notNull().defaultTo(false))
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();

    await sql`CREATE UNIQUE INDEX "Positions_companyId_assetId_unique" ON "Positions" ("companyId", "assetId") WHERE "deletedAt" IS NULL`.execute(
        db
    );
    await sql`CREATE INDEX "Positions_companyId_createdAt_idx" ON "Positions" ("companyId", "createdAt" DESC) WHERE "deletedAt" IS NULL`.execute(
        db
    );
    await sql`CREATE INDEX "Positions_assetId_idx" ON "Positions" ("assetId") WHERE "deletedAt" IS NULL`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('Positions').execute();
}
