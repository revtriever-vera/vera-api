import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('InvestmentImports')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('createdBy', 'uuid', (col) => col.references('Users.id').onDelete('set null'))
        .addColumn('source', 'text', (col) => col.notNull().check(sql`"source" IN ('b3', 'crypto_csv', 'model')`))
        .addColumn('fileSha256', 'text', (col) => col.notNull())
        .addColumn('fileName', 'text', (col) => col.notNull())
        .addColumn('noteNumbers', sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'::text[]`))
        .addColumn('status', 'text', (col) =>
            col
                .notNull()
                .defaultTo('completed')
                .check(sql`"status" IN ('completed', 'undone')`)
        )
        .addColumn('positionsBefore', 'jsonb', (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
        .addColumn('positionsAfter', 'jsonb', (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();

    await sql`CREATE INDEX "InvestmentImports_companyId_createdAt_idx" ON "InvestmentImports" ("companyId", "createdAt" DESC) WHERE "deletedAt" IS NULL`.execute(
        db
    );

    await db.schema
        .createTable('InvestmentOperations')
        .addColumn('id', 'uuid', (col) => col.primaryKey())
        .addColumn('companyId', 'uuid', (col) => col.notNull().references('Companies.id').onDelete('cascade'))
        .addColumn('importId', 'uuid', (col) => col.notNull().references('InvestmentImports.id').onDelete('cascade'))
        .addColumn('assetId', 'uuid', (col) => col.notNull().references('Assets.id'))
        .addColumn('holderUserId', 'uuid', (col) => col.references('Users.id').onDelete('set null'))
        .addColumn('kind', 'text', (col) =>
            col.notNull().check(sql`"kind" IN ('buy', 'sell', 'split', 'reverse_split', 'bonus', 'income', 'transfer')`)
        )
        .addColumn('incomeKind', 'text', (col) =>
            col.check(sql`"incomeKind" IS NULL OR "incomeKind" IN ('dividend', 'jcp', 'fii_income', 'interest', 'staking')`)
        )
        .addColumn('tradeDate', 'date', (col) => col.notNull())
        .addColumn('settlementDate', 'date')
        .addColumn('lineNumber', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('quantity', sql`numeric(28,10)`, (col) => col.notNull().check(sql`"quantity" >= 0`))
        .addColumn('unitPrice', sql`numeric(24,8)`, (col) => col.notNull().check(sql`"unitPrice" >= 0`))
        .addColumn('grossMinor', 'bigint', (col) => col.notNull())
        .addColumn('feesMinor', 'bigint', (col) => col.notNull().defaultTo(0))
        .addColumn('withheldTaxMinor', 'bigint')
        .addColumn('currency', 'text', (col) => col.notNull())
        .addColumn('fxRate', sql`numeric(18,8)`)
        .addColumn('grossBrlMinor', 'bigint')
        .addColumn('dayTrade', 'boolean', (col) => col.notNull().defaultTo(false))
        .addColumn('appliedToPosition', 'boolean', (col) => col.notNull().defaultTo(false))
        .addColumn('fingerprint', 'text', (col) => col.notNull())
        .addColumn('createdAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updatedAt', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('deletedAt', 'timestamptz')
        .execute();

    await sql`CREATE UNIQUE INDEX "InvestmentOperations_companyId_fingerprint_unique" ON "InvestmentOperations" ("companyId", "fingerprint") WHERE "deletedAt" IS NULL`.execute(
        db
    );
    await sql`CREATE INDEX "InvestmentOperations_companyId_assetId_tradeDate_idx" ON "InvestmentOperations" ("companyId", "assetId", "tradeDate") WHERE "deletedAt" IS NULL`.execute(
        db
    );
    await sql`CREATE INDEX "InvestmentOperations_companyId_importId_idx" ON "InvestmentOperations" ("companyId", "importId") WHERE "deletedAt" IS NULL`.execute(
        db
    );
    await sql`CREATE INDEX "InvestmentOperations_companyId_holderUserId_idx" ON "InvestmentOperations" ("companyId", "holderUserId") WHERE "deletedAt" IS NULL`.execute(
        db
    );
    await sql`CREATE INDEX "InvestmentOperations_assetId_idx" ON "InvestmentOperations" ("assetId")`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('InvestmentOperations').execute();
    await db.schema.dropTable('InvestmentImports').execute();
}
