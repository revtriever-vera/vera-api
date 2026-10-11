import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { IndexSyncApplication } from '../../src/modules/fixed-income/application/index-sync.application';
import { addDays } from '../../src/modules/fixed-income/domain/curve/business-days';
import { PortfolioSnapshotService } from '../../src/modules/portfolio/services/portfolio-snapshot.service';
import { DateUtil } from '../../src/shared/utils/date.util';
import { Account, AllocationHarness } from './support/allocation-harness';
import { addPrototypePositions, seedPrototypeAssets, seedUsdRate } from './support/portfolio-seed';
import { CapturingPublisher } from './support/queue';

process.env['FIXED_INCOME_INDEX_DRIVER'] = 'mock';

interface HoldingBody {
    readonly kind: string;
    readonly id: string;
    readonly assetId: string | null;
    readonly symbol: string;
    readonly market: string | null;
    readonly typeGroup: string;
    readonly classId: string;
    readonly quantity: string | null;
    readonly quantityDecimals: number | null;
    readonly unitPrice: string | null;
    readonly priceCurrency: string | null;
    readonly nativeValueMinor: number;
    readonly nativeCurrency: string;
    readonly valueMinor: number;
    readonly valueSource: string;
    readonly priceDate: string | null;
    readonly dollarExposure: boolean;
    readonly missingQuote: boolean;
    readonly stale: boolean;
    readonly estimated: boolean;
}

interface HoldingsBody {
    readonly baseCurrency: string;
    readonly asOf: string;
    readonly data: HoldingBody[];
}

interface ClassBody {
    readonly id: string;
    readonly systemKey: string | null;
}

interface DetailAsset {
    readonly id: string;
    readonly symbol: string;
    readonly valueMinor: number;
    readonly shareInClassBps: number;
    readonly targetInClassBps: number;
    readonly deviationBps: number;
    readonly status: string;
    readonly gapMinor: number;
    readonly isZeroQuantity: boolean;
}

interface DetailBody {
    readonly class: { readonly classId: string; readonly systemKey: string | null; readonly valueMinor: number };
    readonly targetsSumBps: number;
    readonly assets: DetailAsset[];
}

const TODAY: string = DateUtil.todayInBrazil();
const QUERY_CEILING: number = 12;
const MANY_POSITIONS: number = 200;

describe('portfolio holdings', () => {
    let harness: AllocationHarness;
    let assetIds: Record<string, string>;

    beforeAll(async () => {
        harness = await AllocationHarness.start('portfolio_holdings', new CapturingPublisher());
        const sync: IndexSyncApplication = harness.app.get(IndexSyncApplication, { strict: false });
        const from: string = addDays(TODAY, -800);
        await sync.syncWindow({ series: 'cdi_daily', from, to: TODAY });
        await sync.syncWindow({ series: 'ipca_monthly', from, to: TODAY });
        assetIds = await seedPrototypeAssets(harness);
        await seedUsdRate(harness);
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function classOf(account: Account, systemKey: string): Promise<ClassBody> {
        const response = await harness.call<{ data: ClassBody[] }>(account.token, 'GET', '/allocation/classes');
        return response.body.data.find((item: ClassBody) => item.systemKey === systemKey) as ClassBody;
    }

    async function holdings(account: Account): Promise<HoldingsBody> {
        const response = await harness.call<HoldingsBody>(account.token, 'GET', '/portfolio/holdings');
        expect(response.status).toBe(200);
        return response.body;
    }

    async function detail(account: Account, classId: string): Promise<DetailBody> {
        const response = await harness.call<DetailBody>(account.token, 'GET', `/portfolio/classes/${classId}`);
        expect(response.status).toBe(200);
        return response.body;
    }

    it('lista as holdings com valor, fonte e qualidade, ordenadas por classe e valor', async () => {
        const account: Account = await harness.signUp('holdings');
        await addPrototypePositions(harness, account, assetIds);
        const created = await harness.call<{ id: string; valuation: { valueMinor: number } }>(
            account.token,
            'POST',
            '/fixed-income/titles',
            {
                kind: 'cdb',
                name: 'CDB Banco',
                indexer: 'cdi_percent',
                rateBps: 11000,
                appliedMinor: 10_000_000,
                appliedAt: addDays(TODAY, -540),
                maturityDate: addDays(TODAY, 900)
            }
        );

        const body: HoldingsBody = await holdings(account);

        const bySymbol: Record<string, HoldingBody> = Object.fromEntries(body.data.map((item: HoldingBody) => [item.symbol, item]));
        expect(body).toMatchObject({ baseCurrency: 'BRL', asOf: TODAY });
        expect(body.data).toHaveLength(17);
        expect(bySymbol['ITUB4']).toMatchObject({
            kind: 'position',
            market: 'B3',
            typeGroup: 'acoes_br',
            quantity: '2000',
            quantityDecimals: 0,
            unitPrice: '37.8',
            priceCurrency: 'BRL',
            nativeValueMinor: 7_560_000,
            valueMinor: 7_560_000,
            valueSource: 'brapi',
            priceDate: TODAY,
            dollarExposure: false,
            missingQuote: false,
            stale: false
        });
        expect(bySymbol['VOO']).toMatchObject({
            nativeCurrency: 'USD',
            nativeValueMinor: 2_180_000,
            valueMinor: 11_815_600,
            valueSource: 'finnhub',
            dollarExposure: true
        });
        expect(bySymbol['IVVB11']).toMatchObject({ nativeCurrency: 'BRL', dollarExposure: true });
        expect(bySymbol['BTC']).toMatchObject({ quantity: '0.45', nativeValueMinor: 2_790_000, valueSource: 'coingecko' });
        expect(bySymbol['TESOURO-SELIC-2029']).toMatchObject({ market: 'TESOURO', valueSource: 'tesouro_direto', valueMinor: 5_184_000 });
        expect(bySymbol['CDB Banco']).toMatchObject({
            kind: 'fixed_income',
            id: created.body.id,
            assetId: null,
            quantity: null,
            market: null,
            typeGroup: 'fixed_income',
            valueSource: 'curve_cdi',
            valueMinor: created.body.valuation.valueMinor,
            estimated: false
        });
        const classOrder: string[] = body.data.map((item: HoldingBody) => item.classId);
        expect(classOrder).toEqual([...classOrder].sort((left, right) => classOrder.indexOf(left) - classOrder.indexOf(right)));
        const equities: number[] = body.data
            .filter((item: HoldingBody) => item.typeGroup === 'acoes_eua')
            .map((item: HoldingBody) => item.valueMinor);
        expect(equities).toEqual([...equities].sort((left: number, right: number) => right - left));
    });

    it('detalha uma classe com meta efetiva dividida por igual quando nada foi gravado', async () => {
        const account: Account = await harness.signUp('detail-equal');
        await addPrototypePositions(harness, account, assetIds);
        const acoesBr: ClassBody = await classOf(account, 'acoes_br');

        const body: DetailBody = await detail(account, acoesBr.id);

        expect(body.class).toMatchObject({ systemKey: 'acoes_br', valueMinor: 22_017_000 });
        expect(body.targetsSumBps).toBe(0);
        expect(body.assets.map((item: DetailAsset) => item.symbol)).toEqual(['WEGE3', 'ITUB4', 'PETR4']);
        expect(body.assets.map((item: DetailAsset) => item.targetInClassBps)).toEqual([3334, 3333, 3333]);
        expect(body.assets.reduce((sum: number, item: DetailAsset) => sum + item.shareInClassBps, 0)).toBe(10000);
        expect(body.assets.map((item: DetailAsset) => item.shareInClassBps)).toEqual([3549, 3434, 3017]);
        expect(body.assets[0]).toMatchObject({ deviationBps: 215, status: 'within' });
        expect(body.assets[0]?.gapMinor).toBe(Math.round(0.3334 * 22_017_000) - 7_815_000);
    });

    it('respeita as metas gravadas e mostra a posição de quantidade zero com 0%', async () => {
        const account: Account = await harness.signUp('detail-stored');
        const positions: Record<string, string> = await addPrototypePositions(harness, account, assetIds, ['PETR4']);
        const fii: ClassBody = await classOf(account, 'fii');
        const emptied = await harness.call(account.token, 'PATCH', `/positions/${positions['HGLG11'] as string}`, { quantity: '0' });
        expect(emptied.status).toBe(200);
        const saved = await harness.call(account.token, 'PUT', `/allocation/targets/classes/${fii.id}/assets`, {
            targets: [
                { subjectType: 'position', subjectId: positions['HGLG11'], targetInClassBps: 6000 },
                { subjectType: 'position', subjectId: positions['KNRI11'], targetInClassBps: 4000 }
            ]
        });
        expect(saved.status).toBe(200);

        const body: DetailBody = await detail(account, fii.id);

        expect(body.targetsSumBps).toBe(10000);
        const zero: DetailAsset = body.assets.find((item: DetailAsset) => item.symbol === 'HGLG11') as DetailAsset;
        expect(zero).toMatchObject({
            isZeroQuantity: true,
            valueMinor: 0,
            shareInClassBps: 0,
            targetInClassBps: 6000,
            deviationBps: -6000,
            status: 'below'
        });
        expect(zero.gapMinor).toBe(Math.round(0.6 * 5_320_000));
        expect(body.assets.find((item: DetailAsset) => item.symbol === 'KNRI11')).toMatchObject({
            shareInClassBps: 10000,
            targetInClassBps: 4000
        });
    });

    it('carrega 200 posições em no máximo 12 consultas', async () => {
        const account: Account = await harness.signUp('many');
        const acoesBr: ClassBody = await classOf(account, 'acoes_br');
        await seedManyPositions(harness.pg, account.company.id, acoesBr.id);
        const service: PortfolioSnapshotService = harness.app.get(PortfolioSnapshotService, { strict: false });
        await harness.inCompany(account.company.id, async () => service.build());
        const spy = vi.spyOn(Client.prototype as unknown as { query: (...args: unknown[]) => unknown }, 'query');

        const snapshot = await harness.inCompany(account.company.id, async () => service.build());

        const used: number = spy.mock.calls.length;
        expect(snapshot.holdings).toHaveLength(MANY_POSITIONS);
        expect(snapshot.totalMinor).toBe(MANY_POSITIONS * 1000 * 12 * 100);
        spy.mockRestore();
        expect(used).toBeLessThanOrEqual(QUERY_CEILING);
    });
});

async function seedManyPositions(pg: Client, companyId: string, classId: string): Promise<void> {
    await pg.query(
        `INSERT INTO "Assets" ("id","market","externalId","symbol","name","kind","typeGroup","suggestedClassKey","currency","quotesProvider","quantityDecimals")
         SELECT gen_random_uuid(), 'B3', 'BULK' || n || '-' || $1::text, 'BULK' || n, 'Bulk ' || n, 'stock', 'acoes_br', 'acoes_br', 'BRL', 'brapi', 0
         FROM generate_series(1, $2::int) AS n`,
        [companyId, MANY_POSITIONS]
    );
    await pg.query(
        `INSERT INTO "AssetQuotes" ("assetId","currency","price","priceDate","source")
         SELECT "id", 'BRL', '12', $2::date, 'brapi' FROM "Assets" WHERE "externalId" LIKE '%' || $1::text`,
        [companyId, TODAY]
    );
    await pg.query(
        `INSERT INTO "Positions" ("id","companyId","assetId","quantity")
         SELECT gen_random_uuid(), $1, "id", 1000 FROM "Assets" WHERE "externalId" LIKE '%' || $2::text`,
        [companyId, companyId]
    );
    await pg.query(
        `INSERT INTO "AssetClassAssignments" ("id","companyId","subjectType","subjectId","classId")
         SELECT gen_random_uuid(), $1, 'position', "id", $2 FROM "Positions" WHERE "companyId" = $1`,
        [companyId, classId]
    );
}
