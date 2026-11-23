import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays } from '../../src/modules/fixed-income/domain/curve/business-days';
import { DateUtil } from '../../src/shared/utils/date.util';
import { Account, AllocationHarness } from './support/allocation-harness';
import { addPrototypePositions, seedPrototypeAssets, seedUsdRate } from './support/portfolio-seed';
import { CapturingPublisher } from './support/queue';

process.env['FIXED_INCOME_INDEX_DRIVER'] = 'mock';

interface RowBody {
    readonly key: string;
    readonly kind?: string;
    readonly name?: string | null;
    readonly valueMinor: number;
    readonly shareBps: number;
    readonly assets: string[];
    readonly moreCount: number;
}

interface ConcentrationBody {
    readonly asOf: string;
    readonly baseCurrency: string;
    readonly totalMinor: number;
    readonly equityTotalMinor: number;
    readonly byIssuer: RowBody[];
    readonly byIssuerOthers: { readonly valueMinor: number; readonly shareBps: number; readonly groups: number } | null;
    readonly bySector: RowBody[];
}

const TODAY: string = DateUtil.todayInBrazil();

describe('portfolio concentration', () => {
    let harness: AllocationHarness;
    let assetIds: Record<string, string>;

    beforeAll(async () => {
        harness = await AllocationHarness.start('concentration', new CapturingPublisher());
        assetIds = await seedPrototypeAssets(harness);
        await seedUsdRate(harness);
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function createTitle(account: Account, overrides: Record<string, unknown>): Promise<void> {
        const response = await harness.call(account.token, 'POST', '/fixed-income/titles', {
            kind: 'lci',
            name: 'LCI Itau',
            indexer: 'prefixed',
            rateBps: 1000,
            appliedMinor: 4_000_000,
            appliedAt: addDays(TODAY, -30),
            maturityDate: addDays(TODAY, 300),
            ...overrides
        });
        expect(response.status).toBe(201);
    }

    async function concentration(account: Account): Promise<ConcentrationBody> {
        const response = await harness.call<ConcentrationBody>(account.token, 'GET', '/portfolio/concentration');
        expect(response.status).toBe(200);
        return response.body;
    }

    it('returns both blocks for a portfolio with stocks, funds, crypto and securities', async () => {
        const account: Account = await harness.signUp('concentration-full');
        await addPrototypePositions(harness, account, assetIds);
        await createTitle(account, { issuerId: 'itau-unibanco' });
        await createTitle(account, { kind: 'cdb', name: 'CDB sem emissor' });

        const body: ConcentrationBody = await concentration(account);

        expect(body.baseCurrency).toBe('BRL');
        const itau: RowBody | undefined = body.byIssuer.find((row: RowBody) => row.key === 'itau-unibanco');
        expect(itau).toMatchObject({ kind: 'group', name: expect.any(String) });
        expect(itau?.assets).toEqual(expect.arrayContaining(['LCI Itau', 'ITUB4']));
        expect(body.byIssuer.map((row: RowBody) => row.key)).toEqual(
            expect.arrayContaining(['tesouro-nacional', 'crypto', 'missing_issuer', 'itau-unibanco'])
        );
        const issuerSum: number = body.byIssuer.reduce((total: number, row: RowBody) => total + row.shareBps, 0);
        expect(issuerSum + (body.byIssuerOthers?.shareBps ?? 0)).toBe(10_000);
        expect(body.bySector.map((row: RowBody) => row.key)).toEqual(expect.arrayContaining(['financeiro', 'imobiliario_logistica']));
        expect(body.bySector.reduce((total: number, row: RowBody) => total + row.shareBps, 0)).toBe(10_000);
        expect(body.bySector.reduce((total: number, row: RowBody) => total + row.valueMinor, 0)).toBe(body.equityTotalMinor);
        expect(body.byIssuer).toHaveLength(10);
    });

    it('returns empty lists for an empty portfolio', async () => {
        const account: Account = await harness.signUp('concentration-empty');

        const body: ConcentrationBody = await concentration(account);

        expect(body).toMatchObject({ totalMinor: 0, equityTotalMinor: 0, byIssuer: [], byIssuerOthers: null, bySector: [] });
    });

    it('isolates the companies', async () => {
        const owner: Account = await harness.signUp('concentration-a');
        const other: Account = await harness.signUp('concentration-b');
        await createTitle(owner, { issuerId: 'itau-unibanco' });

        const own: ConcentrationBody = await concentration(owner);
        const foreign: ConcentrationBody = await concentration(other);

        expect(own.byIssuer.map((row: RowBody) => row.key)).toEqual(['itau-unibanco']);
        expect(foreign.byIssuer).toEqual([]);
    });

    it('requires authentication', async () => {
        const response = await harness.call('invalid-token', 'GET', '/portfolio/concentration');

        expect(response.status).toBe(401);
    });
});
