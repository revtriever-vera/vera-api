import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DateUtil } from '../../src/shared/utils/date.util';
import { DecimalUtil } from '../../src/shared/utils/decimal.util';
import { addDays, isWeekday } from '../../src/modules/fixed-income/domain/curve/business-days';
import { MOCK_DAILY_CDI } from '../../src/modules/fixed-income/drivers/mock-index-series.driver';
import { IndexSyncApplication } from '../../src/modules/fixed-income/application/index-sync.application';
import { FixedIncomeValuationService } from '../../src/modules/fixed-income/services/fixed-income-valuation.service';
import { Account, AllocationHarness } from './support/allocation-harness';

process.env['FIXED_INCOME_INDEX_DRIVER'] = 'mock';

interface ValuationBody {
    readonly asOf: string;
    readonly valueMinor: number;
    readonly currency: string;
    readonly accruedBps: number;
    readonly matured: boolean;
    readonly estimated: boolean;
    readonly status: string;
    readonly source: string;
    readonly taxRegime: string;
    readonly taxEstimatedMinor: number;
    readonly netEstimatedMinor: number;
}

interface TitleBody {
    readonly id: string;
    readonly kind: string;
    readonly name: string;
    readonly indexer: string;
    readonly rateBps: number;
    readonly currency: string;
    readonly appliedMinor: number;
    readonly appliedAt: string;
    readonly maturityDate: string;
    readonly classId: string;
    readonly valuation: ValuationBody;
}

interface ClassBody {
    readonly id: string;
    readonly systemKey: string | null;
}

interface ProblemBody {
    readonly type: string;
}

const TODAY: string = DateUtil.todayInBrazil();
const APPLIED_AT: string = addDays(TODAY, -540);
const MATURITY: string = addDays(TODAY, 900);

function cdbBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        kind: 'cdb',
        name: 'CDB Banco Exemplo',
        indexer: 'cdi_percent',
        rateBps: 11000,
        appliedMinor: 10_000_000,
        appliedAt: APPLIED_AT,
        maturityDate: MATURITY,
        ...overrides
    };
}

function expectedCdiValue(appliedMinor: number, appliedAt: string, percentBps: number): number {
    let businessDays: number = 0;
    for (let date: string = appliedAt; date < TODAY; date = addDays(date, 1)) {
        businessDays += isWeekday(date) ? 1 : 0;
    }
    const daily = DecimalUtil.of(1).plus(DecimalUtil.of(MOCK_DAILY_CDI).div(100).times(percentBps).div(10000));
    return DecimalUtil.roundHalfUpToInteger(DecimalUtil.of(appliedMinor).times(daily.pow(businessDays)));
}

describe('fixed income titles', () => {
    let harness: AllocationHarness;

    beforeAll(async () => {
        harness = await AllocationHarness.start('fixed_income_titles');
        const sync: IndexSyncApplication = harness.app.get(IndexSyncApplication, { strict: false });
        const from: string = addDays(TODAY, -800);
        await sync.syncWindow({ series: 'cdi_daily', from, to: TODAY });
        await sync.syncWindow({ series: 'ipca_monthly', from, to: TODAY });
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function createTitle(account: Account, overrides: Record<string, unknown> = {}): Promise<TitleBody> {
        const response = await harness.call<TitleBody>(account.token, 'POST', '/fixed-income/titles', cdbBody(overrides));
        expect(response.status).toBe(201);
        return response.body;
    }

    async function countTitles(account: Account): Promise<number> {
        const result = await harness.pg.query<{ total: string }>(
            'SELECT count(*) AS total FROM "FixedIncomeTitles" WHERE "companyId" = $1 AND "deletedAt" IS NULL',
            [account.company.id]
        );
        return Number(result.rows[0]?.total);
    }

    it('exige sessão em todas as rotas', async () => {
        const id: string = crypto.randomUUID();

        const statuses: number[] = await Promise.all([
            harness.call(null, 'POST', '/fixed-income/titles', cdbBody()).then((r) => r.status),
            harness.call(null, 'GET', `/fixed-income/titles/${id}`).then((r) => r.status),
            harness.call(null, 'PATCH', `/fixed-income/titles/${id}`, {}).then((r) => r.status),
            harness.call(null, 'DELETE', `/fixed-income/titles/${id}`).then((r) => r.status),
            harness.call(null, 'POST', '/fixed-income/preview', {}).then((r) => r.status)
        ]);

        expect(statuses).toEqual([401, 401, 401, 401, 401]);
    });

    it('cadastra um CDB 110% do CDI de 18 meses e devolve o valor da curva sem o usuário informar saldo', async () => {
        const account: Account = await harness.signUp('crud');
        const classes = await harness.call<{ data: ClassBody[] }>(account.token, 'GET', '/allocation/classes');
        const rfPos: ClassBody = classes.body.data.find((item) => item.systemKey === 'rf_pos') as ClassBody;

        const created: TitleBody = await createTitle(account);

        expect(created).toMatchObject({
            kind: 'cdb',
            name: 'CDB Banco Exemplo',
            indexer: 'cdi_percent',
            rateBps: 11000,
            currency: 'BRL',
            appliedMinor: 10_000_000,
            appliedAt: APPLIED_AT,
            maturityDate: MATURITY,
            classId: rfPos.id
        });
        expect(created.valuation).toMatchObject({
            asOf: TODAY,
            source: 'curve_cdi',
            status: 'ok',
            estimated: false,
            matured: false,
            taxRegime: 'regressive',
            currency: 'BRL'
        });
        expect(created.valuation.valueMinor).toBe(expectedCdiValue(10_000_000, APPLIED_AT, 11000));
        expect(created.valuation.netEstimatedMinor).toBe(created.valuation.valueMinor - created.valuation.taxEstimatedMinor);
        expect(created.valuation.taxEstimatedMinor).toBeGreaterThan(0);
    });

    it('lê, edita a taxa (o valor muda) e remove liberando a atribuição de classe', async () => {
        const account: Account = await harness.signUp('lifecycle');
        const created: TitleBody = await createTitle(account);

        const read = await harness.call<TitleBody>(account.token, 'GET', `/fixed-income/titles/${created.id}`);
        expect(read.status).toBe(200);
        expect(read.body.valuation.valueMinor).toBe(created.valuation.valueMinor);

        const edited = await harness.call<TitleBody>(account.token, 'PATCH', `/fixed-income/titles/${created.id}`, { rateBps: 12000 });
        expect(edited.status).toBe(200);
        expect(edited.body.rateBps).toBe(12000);
        expect(edited.body.name).toBe('CDB Banco Exemplo');
        expect(edited.body.valuation.valueMinor).toBeGreaterThan(created.valuation.valueMinor);
        expect(edited.body.valuation.valueMinor).toBe(expectedCdiValue(10_000_000, APPLIED_AT, 12000));

        const removed = await harness.call(account.token, 'DELETE', `/fixed-income/titles/${created.id}`);
        expect(removed.status).toBe(204);
        expect((await harness.call<ProblemBody>(account.token, 'GET', `/fixed-income/titles/${created.id}`)).status).toBe(404);
        const released = await harness.call<ProblemBody>(account.token, 'PUT', `/allocation/assignments/fixed_income/${created.id}`, {
            classId: crypto.randomUUID()
        });
        expect(released.status).toBe(404);
        expect(await countTitles(account)).toBe(0);
    });

    it('edição que deixa os termos incoerentes é recusada e não grava', async () => {
        const account: Account = await harness.signUp('patch-invalid');
        const created: TitleBody = await createTitle(account);

        const response = await harness.call<ProblemBody>(account.token, 'PATCH', `/fixed-income/titles/${created.id}`, { currency: 'USD' });

        expect(response.status).toBe(422);
        expect(response.body.type).toBe('fixed_income.invalid_terms');
        const reread = await harness.call<TitleBody>(account.token, 'GET', `/fixed-income/titles/${created.id}`);
        expect(reread.body.currency).toBe('BRL');
    });

    it('o preview devolve o mesmo número do cadastro e não grava nada', async () => {
        const account: Account = await harness.signUp('preview');
        const { name: _name, ...terms } = cdbBody();

        const preview = await harness.call<ValuationBody>(account.token, 'POST', '/fixed-income/preview', terms);

        expect(preview.status).toBe(200);
        expect(await countTitles(account)).toBe(0);
        const created: TitleBody = await createTitle(account);
        expect(preview.body).toEqual(created.valuation);
    });

    it('o preview recusa campos que não são dele e limita a 120 por minuto por company', async () => {
        const account: Account = await harness.signUp('preview-limit');
        const { name: _name, ...terms } = cdbBody();

        const withName = await harness.call(account.token, 'POST', '/fixed-income/preview', cdbBody());
        expect(withName.status).toBe(400);

        const statuses: number[] = [];
        for (let call: number = 0; call < 121; call += 1) {
            statuses.push((await harness.call(account.token, 'POST', '/fixed-income/preview', terms)).status);
        }
        expect(statuses.filter((status) => status === 200)).toHaveLength(120);
        expect(statuses.at(-1)).toBe(429);

        const other: Account = await harness.signUp('preview-limit-other');
        expect((await harness.call(other.token, 'POST', '/fixed-income/preview', terms)).status).toBe(200);
    });

    it('isola as companies: B não lê, edita nem remove o título de A, e valueAll de B não o contém', async () => {
        const owner: Account = await harness.signUp('tenant-a');
        const stranger: Account = await harness.signUp('tenant-b');
        const title: TitleBody = await createTitle(owner);
        const valuation: FixedIncomeValuationService = harness.app.get(FixedIncomeValuationService, { strict: false });

        const read = await harness.call<ProblemBody>(stranger.token, 'GET', `/fixed-income/titles/${title.id}`);
        const edit = await harness.call<ProblemBody>(stranger.token, 'PATCH', `/fixed-income/titles/${title.id}`, { rateBps: 1 });
        const remove = await harness.call<ProblemBody>(stranger.token, 'DELETE', `/fixed-income/titles/${title.id}`);

        expect([read.status, edit.status, remove.status]).toEqual([404, 404, 404]);
        expect(read.body.type).toBe('fixed_income.title_not_found');
        const ownerStill = await harness.call<TitleBody>(owner.token, 'GET', `/fixed-income/titles/${title.id}`);
        expect(ownerStill.body.rateBps).toBe(11000);
        const valuedForOwner = await harness.inCompany(owner.company.id, async () => valuation.valueAll(new Date()));
        const valuedForStranger = await harness.inCompany(stranger.company.id, async () => valuation.valueAll(new Date()));
        expect(valuedForOwner.map((entry) => entry.title.id)).toContain(title.id);
        expect(valuedForStranger).toEqual([]);
        await expect(harness.inCompany(stranger.company.id, async () => valuation.valueOne(title.id, new Date()))).rejects.toMatchObject({
            code: 'fixed_income.title_not_found'
        });
    });

    it('dois CDBs do mesmo banco com taxas diferentes coexistem', async () => {
        const account: Account = await harness.signUp('coexist');

        const first: TitleBody = await createTitle(account, { rateBps: 10500 });
        const second: TitleBody = await createTitle(account, { rateBps: 11500 });

        expect(first.id).not.toBe(second.id);
        expect(await countTitles(account)).toBe(2);
        const valuation: FixedIncomeValuationService = harness.app.get(FixedIncomeValuationService, { strict: false });
        const valued = await harness.inCompany(account.company.id, async () => valuation.valueAll(new Date()));
        expect(valued).toHaveLength(2);
    });

    it('limita a company a 200 títulos', async () => {
        const account: Account = await harness.signUp('limit');
        await harness.pg.query(
            `INSERT INTO "FixedIncomeTitles" ("id","companyId","kind","name","indexer","rateBps","currency","appliedMinor","appliedAt","maturityDate","taxRegime")
             SELECT gen_random_uuid(), $1, 'cdb', 'CDB ' || n, 'cdi_percent', 10000, 'BRL', 100000, '2025-01-06', '2030-01-06', 'regressive'
             FROM generate_series(1, 200) AS n`,
            [account.company.id]
        );

        const response = await harness.call<ProblemBody>(account.token, 'POST', '/fixed-income/titles', cdbBody());

        expect(response.status).toBe(422);
        expect(response.body.type).toBe('fixed_income.limit_reached');
        expect(await countTitles(account)).toBe(200);
    });

    it('valida o corpo e as regras entre campos', async () => {
        const account: Account = await harness.signUp('validation');

        const cases: Array<[Record<string, unknown>, number, string?]> = [
            [cdbBody({ name: '   ' }), 400],
            [cdbBody({ name: 'a\u0007b' }), 400],
            [cdbBody({ appliedMinor: 0 }), 400],
            [cdbBody({ appliedMinor: 10.5 }), 400],
            [cdbBody({ appliedAt: '2025-02-30' }), 400],
            [cdbBody({ kind: 'tesouro' }), 400],
            [cdbBody({ extra: true }), 400],
            [cdbBody({ rateBps: 30001 }), 400],
            [cdbBody({ indexer: 'ipca_plus', rateBps: 5001 }), 400],
            [cdbBody({ appliedAt: '2009-12-31' }), 422, 'fixed_income.applied_date_out_of_range'],
            [cdbBody({ appliedAt: addDays(TODAY, 1) }), 422, 'fixed_income.applied_date_out_of_range'],
            [cdbBody({ maturityDate: APPLIED_AT }), 422, 'fixed_income.invalid_terms'],
            [cdbBody({ currency: 'USD' }), 422, 'fixed_income.invalid_terms'],
            [cdbBody({ classId: crypto.randomUUID() }), 404, 'allocation.class_not_found']
        ];
        for (const [body, status, code] of cases) {
            const response = await harness.call<ProblemBody>(account.token, 'POST', '/fixed-income/titles', body);
            expect(response.status, JSON.stringify(body)).toBe(status);
            if (code !== undefined) {
                expect(response.body.type).toBe(code);
            }
        }
        expect(await countTitles(account)).toBe(0);
    });

    it('título em dólar prefixado mantém a moeda e a classe sugerida é a pré', async () => {
        const account: Account = await harness.signUp('usd');
        const classes = await harness.call<{ data: ClassBody[] }>(account.token, 'GET', '/allocation/classes');
        const rfPre: ClassBody = classes.body.data.find((item) => item.systemKey === 'rf_pre') as ClassBody;

        const created: TitleBody = await createTitle(account, { indexer: 'prefixed', rateBps: 450, currency: 'USD', name: 'Treasury' });

        expect(created.classId).toBe(rfPre.id);
        expect(created.valuation).toMatchObject({ currency: 'USD', source: 'curve_pre', status: 'ok' });
        expect(created.valuation.valueMinor).toBeGreaterThan(10_000_000);
    });

    it('IPCA+ usa o IPCA sintético e a classe de IPCA; classId enviado vence a sugestão', async () => {
        const account: Account = await harness.signUp('ipca');
        const classes = await harness.call<{ data: ClassBody[] }>(account.token, 'GET', '/allocation/classes');
        const rfIpca: ClassBody = classes.body.data.find((item) => item.systemKey === 'rf_ipca') as ClassBody;
        const fii: ClassBody = classes.body.data.find((item) => item.systemKey === 'fii') as ClassBody;

        const suggested: TitleBody = await createTitle(account, { indexer: 'ipca_plus', rateBps: 600, name: 'NTN-like' });
        const explicit: TitleBody = await createTitle(account, { indexer: 'ipca_plus', rateBps: 600, classId: fii.id });

        expect(suggested.classId).toBe(rfIpca.id);
        expect(explicit.classId).toBe(fii.id);
        expect(suggested.valuation).toMatchObject({ source: 'curve_ipca', status: 'ok' });
        expect(suggested.valuation.valueMinor).toBeGreaterThan(10_000_000);
    });

    it('LCI é isenta e título aplicado antes da série devolve o valor aplicado sinalizado', async () => {
        const account: Account = await harness.signUp('lci');

        const lci: TitleBody = await createTitle(account, { kind: 'lci', name: 'LCI' });
        const old: TitleBody = await createTitle(account, { appliedAt: '2012-01-02', maturityDate: '2040-01-02' });

        expect(lci.valuation).toMatchObject({ taxRegime: 'exempt', taxEstimatedMinor: 0 });
        expect(lci.valuation.netEstimatedMinor).toBe(lci.valuation.valueMinor);
        expect(old.valuation).toMatchObject({ status: 'index_data_missing', valueMinor: 10_000_000, accruedBps: 0 });
    });

    it('título vencido fica congelado no vencimento e marcado como vencido', async () => {
        const account: Account = await harness.signUp('matured');

        const created: TitleBody = await createTitle(account, {
            appliedAt: addDays(TODAY, -300),
            maturityDate: addDays(TODAY, -100)
        });

        expect(created.valuation.matured).toBe(true);
        expect(created.valuation.status).toBe('ok');
        const again = await harness.call<TitleBody>(account.token, 'GET', `/fixed-income/titles/${created.id}`);
        expect(again.body.valuation.valueMinor).toBe(created.valuation.valueMinor);
    });
});
