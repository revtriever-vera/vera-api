import { DateUtil } from '../../../src/shared/utils/date.util';
import { POSITION_SEEDS, PositionSeed } from '../../support/portfolio-fixtures';
import { Account, AllocationHarness } from './allocation-harness';

const DECIMALS_BY_MARKET: Readonly<Record<string, number>> = { B3: 0, US: 6, CRYPTO: 8, TESOURO: 2 };
const PROVIDER_GROUP_BY_MARKET: Readonly<Record<string, string>> = {
    B3: 'brapi',
    US: 'us_equities',
    CRYPTO: 'coingecko',
    TESOURO: 'tesouro'
};

export async function seedPrototypeAssets(harness: AllocationHarness, omitQuotes: readonly string[] = []): Promise<Record<string, string>> {
    const ids: Record<string, string> = {};
    for (const seed of POSITION_SEEDS) {
        ids[seed.symbol] = await seedAsset(harness, seed, omitQuotes.includes(seed.symbol));
    }
    return ids;
}

export async function seedAsset(harness: AllocationHarness, seed: PositionSeed, omitQuote: boolean): Promise<string> {
    const id: string = crypto.randomUUID();
    await harness.pg.query(
        `INSERT INTO "Assets" ("id","market","externalId","symbol","name","kind","typeGroup","suggestedClassKey","currency","quotesProvider","quantityDecimals","dollarExposure")
         VALUES ($1,$2,$3,$3,$3,'stock',$4,$5,$6,$7,$8,$9)`,
        [
            id,
            seed.market,
            seed.symbol,
            seed.typeGroup,
            seed.classKey,
            seed.currency,
            PROVIDER_GROUP_BY_MARKET[seed.market],
            DECIMALS_BY_MARKET[seed.market],
            seed.dollarExposure ?? false
        ]
    );
    if (!omitQuote) {
        await seedQuote(harness, id, seed.price, seed.currency, seed.provider, DateUtil.todayInBrazil());
    }
    return id;
}

export async function seedQuote(
    harness: AllocationHarness,
    assetId: string,
    price: string,
    currency: string,
    source: string,
    priceDate: string
): Promise<void> {
    await harness.pg.query(
        `INSERT INTO "AssetQuotes" ("assetId","currency","price","priceDate","source") VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT ("assetId") DO UPDATE SET "price" = $3, "priceDate" = $4, "source" = $5`,
        [assetId, currency, price, priceDate, source]
    );
}

export async function seedUsdRate(harness: AllocationHarness, brlPerUnit: string = '5.42'): Promise<void> {
    await harness.pg.query(
        `INSERT INTO "ExchangeRates" ("id","currency","date","brlPerUnit","source") VALUES ($1,'USD',$2,$3,'bcb-ptax')`,
        [crypto.randomUUID(), DateUtil.todayInBrazil(), brlPerUnit]
    );
}

export async function addPrototypePositions(
    harness: AllocationHarness,
    account: Account,
    ids: Readonly<Record<string, string>>,
    skip: readonly string[] = []
): Promise<Record<string, string>> {
    const positionIds: Record<string, string> = {};
    for (const seed of POSITION_SEEDS.filter((item: PositionSeed) => !skip.includes(item.symbol))) {
        const response = await harness.call<{ id: string }>(account.token, 'POST', '/positions', {
            assetId: ids[seed.symbol],
            quantity: seed.quantity
        });
        positionIds[seed.symbol] = response.body.id;
    }
    return positionIds;
}
