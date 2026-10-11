import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IndexSyncApplication } from '../../src/modules/fixed-income/application/index-sync.application';
import { addDays } from '../../src/modules/fixed-income/domain/curve/business-days';
import { MESSAGE_TYPES } from '../../src/shared/constants/queues.constants';
import { DateUtil } from '../../src/shared/utils/date.util';
import { Account, AllocationHarness } from './support/allocation-harness';
import { addPrototypePositions, seedAsset, seedPrototypeAssets, seedUsdRate } from './support/portfolio-seed';
import { CapturingPublisher } from './support/queue';

process.env['FIXED_INCOME_INDEX_DRIVER'] = 'mock';

interface OverviewClass {
    readonly classId: string;
    readonly systemKey: string | null;
    readonly valueMinor: number;
    readonly shareBps: number;
    readonly targetBps: number;
    readonly deviationBps: number;
    readonly status: string;
    readonly gapMinor: number;
    readonly holdingsCount: number;
}

interface OverviewBody {
    readonly baseCurrency: string;
    readonly toleranceBps: number;
    readonly empty: boolean;
    readonly totalMinor: number;
    readonly unclassifiedMinor: number;
    readonly dollarExposure: { readonly valueMinor: number; readonly shareBps: number };
    readonly usdRate: { readonly brlPerUnit: string; readonly date: string; readonly source: string } | null;
    readonly classes: OverviewClass[];
    readonly outsideCount: number;
    readonly largestDeviation: {
        readonly classId: string;
        readonly deviationBps: number;
        readonly gapMinor: number;
        readonly status: string;
    } | null;
    readonly quality: Record<string, number>;
}

interface TitleBody {
    readonly valuation: { readonly valueMinor: number };
}

interface ProblemBody {
    readonly type: string;
}

const TODAY: string = DateUtil.todayInBrazil();

const FIXED_VALUES: Readonly<Record<string, number>> = {
    rf_pre: 9_744_000,
    rf_ipca: 12_900_000,
    acoes_br: 22_017_000,
    fii: 11_640_000,
    acoes_eua: 37_081_960,
    reits: 15_414_480,
    cripto: 20_758_600
};
const SELIC_VALUE: number = 5_184_000;

describe('portfolio overview', () => {
    const publisher: CapturingPublisher = new CapturingPublisher();
    let harness: AllocationHarness;
    let assetIds: Record<string, string>;

    beforeAll(async () => {
        harness = await AllocationHarness.start('portfolio_overview', publisher);
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

    async function overview(account: Account): Promise<OverviewBody> {
        const response = await harness.call<OverviewBody>(account.token, 'GET', '/portfolio/overview');
        expect(response.status).toBe(200);
        return response.body;
    }

    async function createTitle(account: Account, body: Record<string, unknown>): Promise<number> {
        const response = await harness.call<TitleBody>(account.token, 'POST', '/fixed-income/titles', {
            appliedMinor: 10_000_000,
            appliedAt: addDays(TODAY, -540),
            maturityDate: addDays(TODAY, 900),
            ...body
        });
        expect(response.status).toBe(201);
        return response.body.valuation.valueMinor;
    }

    async function prototypeAccount(label: string): Promise<{ account: Account; fixedIncomeMinor: number }> {
        const account: Account = await harness.signUp(label);
        await addPrototypePositions(harness, account, assetIds);
        const cdb: number = await createTitle(account, { kind: 'cdb', name: 'CDB Banco', indexer: 'cdi_percent', rateBps: 11000 });
        const lci: number = await createTitle(account, {
            kind: 'lci',
            name: 'LCI Banco',
            indexer: 'cdi_percent',
            rateBps: 9500,
            appliedMinor: 5_000_000
        });
        return { account, fixedIncomeMinor: cdb + lci };
    }

    it('exige sessão nas três rotas', async () => {
        const statuses: number[] = await Promise.all(
            ['/portfolio/overview', '/portfolio/holdings', `/portfolio/classes/${crypto.randomUUID()}`].map(
                async (path: string) => (await harness.call(null, 'GET', path)).status
            )
        );

        expect(statuses).toEqual([401, 401, 401]);
    });

    it('consolida a carteira do protótipo: valores por classe, soma igual ao total, exposição ao dólar e maior desvio', async () => {
        const { account, fixedIncomeMinor } = await prototypeAccount('prototype');

        const body: OverviewBody = await overview(account);

        const byKey: Record<string, OverviewClass> = Object.fromEntries(body.classes.map((item: OverviewClass) => [item.systemKey, item]));
        const expectedValues: Record<string, number> = { ...FIXED_VALUES, rf_pos: SELIC_VALUE + fixedIncomeMinor };
        for (const [key, value] of Object.entries(expectedValues)) {
            expect(byKey[key]?.valueMinor, key).toBe(value);
        }
        const total: number = Object.values(expectedValues).reduce((sum: number, value: number) => sum + value, 0);
        expect(body).toMatchObject({ baseCurrency: 'BRL', toleranceBps: 500, empty: false, totalMinor: total, unclassifiedMinor: 0 });
        expect(body.classes.reduce((sum: number, item: OverviewClass) => sum + item.valueMinor, 0)).toBe(total);
        expect(body.classes.reduce((sum: number, item: OverviewClass) => sum + item.shareBps, 0)).toBe(10000);
        expect(body.classes.map((item: OverviewClass) => item.systemKey)).toEqual([
            'rf_pos',
            'rf_pre',
            'rf_ipca',
            'acoes_br',
            'fii',
            'acoes_eua',
            'reits',
            'cripto'
        ]);
        expect(byKey['rf_ipca']).toMatchObject({ targetBps: 1200, holdingsCount: 1 });
        expect(byKey['cripto']).toMatchObject({ valueMinor: 20_758_600, targetBps: 500, holdingsCount: 2 });
        const dollar: number = 37_081_960 + 15_414_480 + 20_758_600;
        expect(body.dollarExposure.valueMinor).toBe(dollar);
        expect(body.dollarExposure.shareBps).toBe(Math.round((dollar * 10000) / total));
        expect(body.usdRate).toMatchObject({ brlPerUnit: '5.42', source: 'bcb-ptax' });
        expect(body.quality).toEqual({ missingQuotes: 0, staleQuotes: 0, estimatedFixedIncome: 0, indexDataMissing: 0, missingRates: 0 });
        expect(body.largestDeviation?.classId).toBe(
            [...body.classes].sort(
                (left: OverviewClass, right: OverviewClass) => Math.abs(right.deviationBps) - Math.abs(left.deviationBps)
            )[0]?.classId
        );
    });

    it('troca a moeda base para USD: o total vira dólar pela PTAX e os percentuais ficam', async () => {
        const { account } = await prototypeAccount('usd-base');
        const brl: OverviewBody = await overview(account);

        const saved = await harness.call(account.token, 'PUT', '/allocation/settings', { baseCurrency: 'USD' });
        const usd: OverviewBody = await overview(account);

        expect(saved.status).toBe(200);
        expect(usd.baseCurrency).toBe('USD');
        expect(Math.abs(usd.totalMinor - Math.round(brl.totalMinor / 5.42))).toBeLessThanOrEqual(40);
        expect(usd.classes.map((item: OverviewClass) => item.shareBps)).toEqual(brl.classes.map((item: OverviewClass) => item.shareBps));
        expect(usd.dollarExposure.shareBps).toBe(brl.dollarExposure.shareBps);
        expect(usd.classes.reduce((sum: number, item: OverviewClass) => sum + item.valueMinor, 0)).toBe(usd.totalMinor);
    });

    it('ativo sem cotação entra com valor zero, é contado na qualidade e a busca sob demanda é enfileirada', async () => {
        const account: Account = await harness.signUp('no-quote');
        const assetId: string = await seedAsset(
            harness,
            {
                symbol: 'NOQUOTE3',
                classKey: 'acoes_br',
                market: 'B3',
                typeGroup: 'acoes_br',
                currency: 'BRL',
                quantity: '10',
                price: '10',
                provider: 'brapi'
            },
            true
        );
        await harness.call(account.token, 'POST', '/positions', { assetId, quantity: '10' });
        publisher.published.length = 0;

        const body: OverviewBody = await overview(account);
        const holdings = await harness.call<{
            data: { symbol: string; missingQuote: boolean; valueMinor: number; unitPrice: string | null }[];
        }>(account.token, 'GET', '/portfolio/holdings');

        expect(body.totalMinor).toBe(0);
        expect(body.empty).toBe(false);
        expect(body.quality.missingQuotes).toBe(1);
        expect(holdings.body.data[0]).toMatchObject({ symbol: 'NOQUOTE3', missingQuote: true, valueMinor: 0, unitPrice: null });
        const requested = publisher.ofType(MESSAGE_TYPES.marketDataQuoteOndemandRequested);
        expect(requested.some((message) => (message.payload as { assetId: string }).assetId === assetId)).toBe(true);
    });

    it('carteira vazia responde sem erro, com as oito classes zeradas', async () => {
        const account: Account = await harness.signUp('empty');

        const body: OverviewBody = await overview(account);

        expect(body).toMatchObject({ empty: true, totalMinor: 0, unclassifiedMinor: 0, outsideCount: 0, largestDeviation: null });
        expect(body.dollarExposure).toEqual({ valueMinor: 0, shareBps: 0 });
        expect(body.classes).toHaveLength(8);
        expect(body.classes.every((item: OverviewClass) => item.valueMinor === 0 && item.shareBps === 0)).toBe(true);
    });

    it('cada empresa vê só a sua carteira e a classe de outra empresa é 404', async () => {
        const first: Account = await harness.signUp('tenant-a');
        const second: Account = await harness.signUp('tenant-b');
        await harness.call(first.token, 'POST', '/positions', { assetId: assetIds['ITUB4'], quantity: '100' });
        await harness.call(second.token, 'POST', '/positions', { assetId: assetIds['VOO'], quantity: '2' });

        const firstBody: OverviewBody = await overview(first);
        const secondBody: OverviewBody = await overview(second);
        const secondClass: OverviewClass = secondBody.classes[0] as OverviewClass;
        const foreign = await harness.call<ProblemBody>(first.token, 'GET', `/portfolio/classes/${secondClass.classId}`);

        expect(firstBody.totalMinor).toBe(378_000);
        expect(secondBody.totalMinor).toBe(2 * 545 * 542);
        expect(firstBody.dollarExposure.valueMinor).toBe(0);
        expect(foreign.status).toBe(404);
        expect(foreign.body.type).toBe('allocation.class_not_found');
    });
});
