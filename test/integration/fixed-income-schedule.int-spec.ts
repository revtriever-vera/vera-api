import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IndexSyncApplication } from '../../src/modules/fixed-income/application/index-sync.application';
import { addDays } from '../../src/modules/fixed-income/domain/curve/business-days';
import { businessDaysBetween } from '../../src/modules/fixed-income/services/index-series-math';
import { DateUtil } from '../../src/shared/utils/date.util';
import { Account, AllocationHarness } from './support/allocation-harness';
import { seedQuote } from './support/portfolio-seed';
import { CapturingPublisher } from './support/queue';

process.env['FIXED_INCOME_INDEX_DRIVER'] = 'mock';

interface MaturityBody {
    readonly holdingKind: string;
    readonly id: string;
    readonly name: string;
    readonly kind: string | null;
    readonly maturityDate: string;
    readonly daysToMaturity: number;
    readonly soon: boolean;
    readonly estimatedValueMinor: number;
    readonly reallocateMinor: number;
    readonly estimated: boolean;
    readonly basis: string;
    readonly taxRegime: string | null;
    readonly isSample: boolean;
}

interface MaturitiesBody {
    readonly asOf: string;
    readonly reference: {
        readonly cdiAnnualBps: number | null;
        readonly ipca12mBps: number | null;
        readonly cdiDate: string | null;
        readonly ipcaMonth: string | null;
    };
    readonly items: MaturityBody[];
}

interface RealRateBody {
    readonly id: string;
    readonly name: string;
    readonly rateBps: number;
    readonly valueMinor: number;
    readonly nominalAnnualBps: number | null;
    readonly realAnnualBps: number | null;
    readonly lowReal: boolean;
    readonly correctedMinor: number;
    readonly purchasingPowerGainMinor: number;
    readonly estimated: boolean;
}

interface RealRatesBody {
    readonly asOf: string;
    readonly reference: { readonly ipca12mBps: number; readonly ipcaMonth: string };
    readonly items: RealRateBody[];
}

interface TitleBody {
    readonly id: string;
    readonly valuation: { readonly valueMinor: number };
}

const TODAY: string = DateUtil.todayInBrazil();
const MOCK_DAILY_CDI: number = 0.04016754;
const MOCK_MONTHLY_IPCA: number = 0.4;

describe('fixed income schedule', () => {
    let harness: AllocationHarness;
    let selicAssetId: string;
    let prefixedAssetId: string;

    beforeAll(async () => {
        harness = await AllocationHarness.start('fixed_income_schedule', new CapturingPublisher());
        selicAssetId = await seedTreasury('selic', 'rf_pos', addDays(TODAY, 200), '16200');
        prefixedAssetId = await seedTreasury('prefixado', 'rf_pre', addDays(TODAY, 100), '812');
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function seedTreasury(slug: string, classKey: string, maturity: string, price: string): Promise<string> {
        const id: string = crypto.randomUUID();
        await harness.pg.query(
            `INSERT INTO "Assets" ("id","market","externalId","symbol","name","kind","typeGroup","suggestedClassKey","currency","quotesProvider","quantityDecimals","maturityDate")
             VALUES ($1,'TESOURO',$2,$3,$3,'treasury','tesouro',$4,'BRL','tesouro',2,$5)`,
            [id, `${slug}:${maturity}`, `Tesouro ${slug} ${maturity.slice(0, 4)}`, classKey, maturity]
        );
        await seedQuote(harness, id, price, 'BRL', 'tesouro', TODAY);
        return id;
    }

    async function createTitle(account: Account, overrides: Record<string, unknown>): Promise<TitleBody> {
        const response = await harness.call<TitleBody>(account.token, 'POST', '/fixed-income/titles', {
            kind: 'cdb',
            name: 'CDB Banco Exemplo',
            indexer: 'prefixed',
            rateBps: 1200,
            appliedMinor: 10_000_000,
            appliedAt: addDays(TODAY, -540),
            maturityDate: addDays(TODAY, 300),
            ...overrides
        });
        expect(response.status).toBe(201);
        return response.body;
    }

    async function maturities(account: Account, query: string = ''): Promise<MaturitiesBody> {
        const response = await harness.call<MaturitiesBody>(account.token, 'GET', `/portfolio/maturities${query}`);
        expect(response.status).toBe(200);
        return response.body;
    }

    async function syncSeries(): Promise<void> {
        const sync: IndexSyncApplication = harness.app.get(IndexSyncApplication, { strict: false });
        const from: string = addDays(TODAY, -800);
        await sync.syncWindow({ series: 'cdi_daily', from, to: TODAY });
        await sync.syncWindow({ series: 'ipca_monthly', from, to: TODAY });
    }

    it('sem nenhuma série real-rates responde 503 e maturities devolve as linhas estimadas', async () => {
        const account: Account = await harness.signUp('schedule-empty');
        const title: TitleBody = await createTitle(account, { indexer: 'cdi_percent', rateBps: 11000, name: 'CDB CDI' });

        const realRates = await harness.call<{ type: string }>(account.token, 'GET', '/portfolio/real-rates');
        const body: MaturitiesBody = await maturities(account);

        expect(realRates.status).toBe(503);
        expect(realRates.body.type).toBe('fixed_income.index_data_missing');
        expect(body.reference).toEqual({ cdiAnnualBps: null, ipca12mBps: null, cdiDate: null, ipcaMonth: null });
        expect(body.items).toHaveLength(1);
        expect(body.items[0]).toMatchObject({ id: expect.any(String), estimated: true, basis: 'cdi_projection' });
        expect(title.valuation.valueMinor).toBe(10_000_000);
        expect(body.items[0]?.estimatedValueMinor).toBe(10_000_000);
    });

    it('lista títulos e Tesouro por vencimento com valor, dias, soon e a referência usada', async () => {
        await syncSeries();
        const account: Account = await harness.signUp('schedule-list');
        const prefixed: TitleBody = await createTitle(account, { name: 'CDB Prefixado', maturityDate: addDays(TODAY, 300) });
        await createTitle(account, {
            kind: 'lci',
            name: 'LCI CDI',
            indexer: 'cdi_percent',
            rateBps: 9500,
            maturityDate: addDays(TODAY, 60)
        });
        await createTitle(account, { name: 'CDB Curto', maturityDate: addDays(TODAY, 1), appliedAt: addDays(TODAY, -30) });
        await harness.call(account.token, 'POST', '/positions', { assetId: selicAssetId, quantity: '3.2' });
        await harness.call(account.token, 'POST', '/positions', { assetId: prefixedAssetId, quantity: '3' });

        const body: MaturitiesBody = await maturities(account);

        expect(body.asOf).toBe(TODAY);
        expect(body.reference.cdiAnnualBps).toBe(Math.round(((1 + MOCK_DAILY_CDI / 100) ** 252 - 1) * 10000));
        expect(body.reference.ipca12mBps).toBe(Math.round(((1 + MOCK_MONTHLY_IPCA / 100) ** 12 - 1) * 10000));
        expect(body.reference.cdiDate).not.toBeNull();
        expect(body.items.map((item: MaturityBody) => [item.name, item.holdingKind, item.daysToMaturity])).toEqual([
            ['CDB Curto', 'fixed_income', 1],
            ['LCI CDI', 'fixed_income', 60],
            [`Tesouro prefixado ${addDays(TODAY, 100).slice(0, 4)}`, 'position', 100],
            [`Tesouro selic ${addDays(TODAY, 200).slice(0, 4)}`, 'position', 200],
            ['CDB Prefixado', 'fixed_income', 300]
        ]);
        const byName: Record<string, MaturityBody> = Object.fromEntries(body.items.map((item: MaturityBody) => [item.name, item]));
        const bd: number = businessDaysBetween(TODAY, addDays(TODAY, 300));
        expect(byName['CDB Prefixado']).toMatchObject({
            kind: 'cdb',
            basis: 'contract',
            soon: false,
            estimated: false,
            taxRegime: 'regressive'
        });
        expect(
            Math.abs((byName['CDB Prefixado']?.estimatedValueMinor ?? 0) - Math.round(prefixed.valuation.valueMinor * 1.12 ** (bd / 252)))
        ).toBeLessThanOrEqual(2);
        expect(byName['LCI CDI']).toMatchObject({ basis: 'cdi_projection', soon: true, taxRegime: 'exempt' });
        expect(byName[`Tesouro prefixado ${addDays(TODAY, 100).slice(0, 4)}`]).toMatchObject({
            holdingKind: 'position',
            basis: 'face_value',
            estimatedValueMinor: 300_000,
            reallocateMinor: 300_000,
            soon: false,
            taxRegime: null
        });
        expect(byName[`Tesouro selic ${addDays(TODAY, 200).slice(0, 4)}`]?.basis).toBe('cdi_projection');
        for (const item of body.items) {
            expect(item.reallocateMinor % 10_000).toBe(0);
            expect(item.reallocateMinor).toBeLessThanOrEqual(item.estimatedValueMinor);
        }
    });

    it('respeita o limite e recusa limite inválido', async () => {
        const account: Account = await harness.signUp('schedule-limit');
        await createTitle(account, { name: 'A', maturityDate: addDays(TODAY, 100) });
        await createTitle(account, { name: 'B', maturityDate: addDays(TODAY, 200) });

        const limited: MaturitiesBody = await maturities(account, '?limit=1');
        const invalid = await harness.call<{ type: string }>(account.token, 'GET', '/portfolio/maturities?limit=0');

        expect(limited.items.map((item: MaturityBody) => item.name)).toEqual(['A']);
        expect(invalid.status).toBe(400);
    });

    it('real-rates devolve taxa real, ganho de poder de compra e marca lowReal', async () => {
        const account: Account = await harness.signUp('schedule-real');
        await createTitle(account, { name: 'Alta', rateBps: 1400 });
        await createTitle(account, { name: 'Baixa', rateBps: 500, maturityDate: addDays(TODAY, 400) });
        await createTitle(account, { name: 'Em dólar', currency: 'USD', rateBps: 500 });

        const response = await harness.call<RealRatesBody>(account.token, 'GET', '/portfolio/real-rates');

        expect(response.status).toBe(200);
        expect(response.body.reference.ipca12mBps).toBe(Math.round(((1 + MOCK_MONTHLY_IPCA / 100) ** 12 - 1) * 10000));
        expect(response.body.items.map((item: RealRateBody) => item.name)).toEqual(['Alta', 'Baixa']);
        const [high, low]: RealRateBody[] = response.body.items as [RealRateBody, RealRateBody];
        expect(high).toMatchObject({ nominalAnnualBps: 1400, lowReal: false, estimated: false });
        expect(low).toMatchObject({ nominalAnnualBps: 500, lowReal: true });
        expect(high.realAnnualBps).toBeGreaterThan(low.realAnnualBps ?? 0);
        const inflation: number = (1 + MOCK_MONTHLY_IPCA / 100) ** 18;
        expect(high.correctedMinor).toBeGreaterThan(10_000_000 * 1.04);
        expect(high.correctedMinor).toBeLessThan(10_000_000 * inflation * 1.02);
        expect(high.purchasingPowerGainMinor).toBe(high.valueMinor - high.correctedMinor);
    });

    it('isola as companies', async () => {
        const first: Account = await harness.signUp('schedule-iso-a');
        const second: Account = await harness.signUp('schedule-iso-b');
        await createTitle(first, { name: 'Só da primeira' });
        await harness.call(first.token, 'POST', '/positions', { assetId: prefixedAssetId, quantity: '1' });

        const body: MaturitiesBody = await maturities(second);
        const realRates = await harness.call<RealRatesBody>(second.token, 'GET', '/portfolio/real-rates');

        expect(body.items).toEqual([]);
        expect(realRates.body.items).toEqual([]);
    });

    it('exige autenticação', async () => {
        const response = await harness.call<{ type: string }>(null, 'GET', '/portfolio/maturities');
        const rates = await harness.call<{ type: string }>(null, 'GET', '/portfolio/real-rates');

        expect(response.status).toBe(401);
        expect(rates.status).toBe(401);
    });
});
