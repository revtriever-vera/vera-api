import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('AssetIssuerLinks')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('assetId', 'uuid', (col) => col.notNull().references('Assets.id'))
        .addColumn('issuerKind', 'text', (col) => col.notNull())
        .addColumn('cnpj', 'text', (col) => col.notNull())
        .addColumn('cvmCode', 'text')
        .addColumn('source', 'text', (col) => col.notNull())
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE UNIQUE INDEX "AssetIssuerLinks_assetId_key" ON "AssetIssuerLinks" ("assetId")`.execute(db);
    await sql`CREATE INDEX "AssetIssuerLinks_cnpj_idx" ON "AssetIssuerLinks" ("cnpj")`.execute(db);
    await db.schema
        .createTable('PortfolioEvents')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('assetId', 'uuid', (col) => col.notNull().references('Assets.id'))
        .addColumn('kind', 'text', (col) => col.notNull())
        .addColumn('exDate', 'date')
        .addColumn('paymentDate', 'date')
        .addColumn('eventDate', 'date')
        .addColumn('amountPerUnit', sql`numeric(24, 8)`)
        .addColumn('currency', sql`char(3)`, (col) => col.notNull())
        .addColumn('source', 'text', (col) => col.notNull())
        .addColumn('externalKey', 'text', (col) => col.notNull())
        .addColumn('documentUrl', 'text')
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();
    await sql`CREATE UNIQUE INDEX "PortfolioEvents_source_externalKey_key" ON "PortfolioEvents" ("source", "externalKey")`.execute(db);
    await sql`CREATE INDEX "PortfolioEvents_assetId_exDate_idx" ON "PortfolioEvents" ("assetId", "exDate")`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('PortfolioEvents').execute();
    await db.schema.dropTable('AssetIssuerLinks').execute();
}
