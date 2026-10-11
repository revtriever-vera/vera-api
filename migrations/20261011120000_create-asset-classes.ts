import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('AssetClasses')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('systemKey', 'text')
        .addColumn('aliasKeys', sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'::text[]`))
        .addColumn('name', 'text')
        .addColumn('colorKey', 'text', (col) => col.notNull())
        .addColumn('targetBps', 'integer', (col) =>
            col
                .notNull()
                .defaultTo(0)
                .check(sql`"targetBps" BETWEEN 0 AND 10000`)
        )
        .addColumn('sortOrder', 'integer', (col) => col.notNull())
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();

    await sql`CREATE UNIQUE INDEX "AssetClasses_companyId_systemKey_unique" ON "AssetClasses" ("companyId", "systemKey") WHERE "systemKey" IS NOT NULL`.execute(
        db
    );
    await sql`CREATE UNIQUE INDEX "AssetClasses_companyId_name_unique" ON "AssetClasses" ("companyId", lower("name")) WHERE "name" IS NOT NULL AND "deletedAt" IS NULL`.execute(
        db
    );
    await sql`CREATE INDEX "AssetClasses_companyId_sortOrder_idx" ON "AssetClasses" ("companyId", "sortOrder") WHERE "deletedAt" IS NULL`.execute(
        db
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('AssetClasses').execute();
}
