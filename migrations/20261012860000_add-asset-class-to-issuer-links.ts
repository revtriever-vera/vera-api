import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE "AssetIssuerLinks" ADD COLUMN "assetClass" text`.execute(db);
    await sql`
        UPDATE "AssetIssuerLinks" AS link
        SET "assetClass" = CASE
            WHEN asset."externalId" ~ '^[A-Z]{4}3$' THEN 'ON'
            WHEN asset."externalId" ~ '^[A-Z]{4}4$' THEN 'PN'
            WHEN asset."externalId" ~ '^[A-Z]{4}5$' THEN 'PNA'
            WHEN asset."externalId" ~ '^[A-Z]{4}6$' THEN 'PNB'
            WHEN asset."externalId" ~ '^[A-Z]{4}11$' THEN 'UNIT'
        END
        FROM "Assets" AS asset
        WHERE asset.id = link."assetId" AND link."issuerKind" = 'company' AND asset.kind = 'stock'
    `.execute(db);
    await sql`DELETE FROM "PortfolioEvents" WHERE source = 'cvm_ipe' AND kind IN ('dividend', 'jcp')`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE "AssetIssuerLinks" DROP COLUMN "assetClass"`.execute(db);
}
