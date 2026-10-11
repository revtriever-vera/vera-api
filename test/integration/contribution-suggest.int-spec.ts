import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PositionSeed } from '../support/portfolio-fixtures';
import { Account, AllocationHarness } from './support/allocation-harness';
import { addPrototypePositions, seedAsset, seedPrototypeAssets, seedUsdRate } from './support/portfolio-seed';

interface AssetBody {
    readonly symbol: string;
    readonly kind: string;
    readonly amountMinor: number;
    readonly approxUnits: string | null;
    readonly targetInClassBps: number;
}

interface ClassBody {
    readonly classId: string;
    readonly systemKey: string | null;
    readonly amountMinor: number;
    readonly shareAfterBps: number;
    readonly note: string | null;
    readonly assets: AssetBody[];
}

interface SuggestBody {
    readonly baseCurrency: string;
    readonly amountMinor: number;
    readonly totalBeforeMinor: number;
    readonly totalAfterMinor: number;
    readonly warnings: string[];
    readonly classes: ClassBody[];
}

interface ProblemBody {
    readonly type: string;
}

interface ClassListBody {
    readonly data: { readonly id: string; readonly systemKey: string }[];
}

const FILLERS: readonly PositionSeed[] = [
    {
        symbol: 'FILL-RF-POS',
        classKey: 'rf_pos',
        market: 'TESOURO',
        typeGroup: 'tesouro',
        currency: 'BRL',
        quantity: '1',
        price: '317300',
        provider: 'tesouro'
    },
    {
        symbol: 'FILL-RF-PRE',
        classKey: 'rf_pre',
        market: 'TESOURO',
        typeGroup: 'tesouro',
        currency: 'BRL',
        quantity: '1',
        price: '108400',
        provider: 'tesouro'
    }
];

const sum = (values: number[]): number => values.reduce((total: number, value: number) => total + value, 0);

describe('contribution suggest', () => {
    let harness: AllocationHarness;
    let assetIds: Record<string, string>;

    beforeAll(async () => {
        harness = await AllocationHarness.start('contribution_suggest');
        assetIds = await seedPrototypeAssets(harness);
        for (const filler of FILLERS) {
            assetIds[filler.symbol] = await seedAsset(harness, filler, false);
        }
        await seedUsdRate(harness);
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function suggest(account: Account, amountMinor: number): Promise<SuggestBody> {
        const response = await harness.call<SuggestBody>(account.token, 'POST', '/portfolio/contributions/suggest', { amountMinor });
        expect(response.status).toBe(200);
        return response.body;
    }

    async function prototypeAccount(label: string): Promise<Account> {
        const account: Account = await harness.signUp(label);
        const positionIds: Record<string, string> = await addPrototypePositions(harness, account, assetIds);
        for (const filler of FILLERS) {
            const added = await harness.call<{ id: string }>(account.token, 'POST', '/positions', {
                assetId: assetIds[filler.symbol],
                quantity: filler.quantity
            });
            expect(added.status).toBe(201);
        }
        const classes = await harness.call<ClassListBody>(account.token, 'GET', '/allocation/classes');
        const acoesBr: string = classes.body.data.find((item) => item.systemKey === 'acoes_br')?.id as string;
        const targeted = await harness.call(account.token, 'PUT', `/allocation/targets/classes/${acoesBr}/assets`, {
            targets: [
                { subjectType: 'position', subjectId: positionIds['ITUB4'], targetInClassBps: 3000 },
                { subjectType: 'position', subjectId: positionIds['WEGE3'], targetInClassBps: 4000 },
                { subjectType: 'position', subjectId: positionIds['PETR4'], targetInClassBps: 3000 }
            ]
        });
        expect(targeted.status).toBe(200);
        return account;
    }

    function byKey(body: SuggestBody, key: string): ClassBody | undefined {
        return body.classes.find((item: ClassBody) => item.systemKey === key);
    }

    it('exige sessão', async () => {
        const response = await harness.call(null, 'POST', '/portfolio/contributions/suggest', { amountMinor: 1000 });

        expect(response.status).toBe(401);
    });

    it('carteira do protótipo com R$ 10.000,00: valores exatos nas duas camadas', async () => {
        const account: Account = await prototypeAccount('prototype');

        const body: SuggestBody = await suggest(account, 1_000_000);

        expect(body).toMatchObject({
            baseCurrency: 'BRL',
            amountMinor: 1_000_000,
            totalBeforeMinor: 177_310_040,
            totalAfterMinor: 178_310_040
        });
        expect(body.warnings).toEqual([]);
        expect(body.classes.map((item: ClassBody) => [item.systemKey, item.amountMinor])).toEqual([
            ['rf_ipca', 394_046],
            ['acoes_eua', 347_596],
            ['acoes_br', 219_325],
            ['fii', 39_033]
        ]);
        expect(Object.fromEntries(body.classes.map((item: ClassBody) => [item.systemKey, item.shareAfterBps]))).toEqual({
            rf_ipca: 746,
            acoes_eua: 2099,
            acoes_br: 1247,
            fii: 655
        });
        const acoesBr: ClassBody = byKey(body, 'acoes_br') as ClassBody;
        expect(acoesBr.assets.map((asset: AssetBody) => [asset.symbol, asset.amountMinor, asset.approxUnits])).toEqual([
            ['WEGE3', 213_607, '40'],
            ['PETR4', 5_718, '1']
        ]);
        expect(acoesBr.assets.map((asset: AssetBody) => asset.targetInClassBps)).toEqual([4000, 3000]);
        expect(sum(body.classes.map((item: ClassBody) => item.amountMinor))).toBe(1_000_000);
        for (const item of body.classes) {
            expect(sum(item.assets.map((asset: AssetBody) => asset.amountMinor))).toBe(item.amountMinor);
        }
    });

    it('troca a moeda base para USD e a soma continua igual ao aporte em dólares', async () => {
        const account: Account = await prototypeAccount('usd-base');
        const saved = await harness.call(account.token, 'PUT', '/allocation/settings', { baseCurrency: 'USD' });
        expect(saved.status).toBe(200);

        const body: SuggestBody = await suggest(account, 250_001);

        expect(body.baseCurrency).toBe('USD');
        expect(sum(body.classes.map((item: ClassBody) => item.amountMinor))).toBe(250_001);
        for (const item of body.classes) {
            expect(sum(item.assets.map((asset: AssetBody) => asset.amountMinor))).toBe(item.amountMinor);
        }
    });

    it('carteira vazia segue as metas, com classes sem ativo marcadas', async () => {
        const account: Account = await harness.signUp('empty');

        const body: SuggestBody = await suggest(account, 1_000_000);

        expect(body.totalBeforeMinor).toBe(0);
        expect(body.classes.map((item: ClassBody) => [item.systemKey, item.amountMinor])).toEqual([
            ['acoes_eua', 250_000],
            ['rf_pos', 200_000],
            ['acoes_br', 150_000],
            ['rf_ipca', 120_000],
            ['rf_pre', 80_000],
            ['reits', 80_000],
            ['fii', 70_000],
            ['cripto', 50_000]
        ]);
        expect(body.classes.every((item: ClassBody) => item.note === 'no_assets' && item.assets.length === 0)).toBe(true);
    });

    it('cada empresa usa só os seus dados', async () => {
        const first: Account = await harness.signUp('tenant-a');
        const second: Account = await harness.signUp('tenant-b');
        await harness.call(first.token, 'POST', '/positions', { assetId: assetIds['ITUB4'], quantity: '100' });
        await harness.call(second.token, 'POST', '/positions', { assetId: assetIds['VOO'], quantity: '2' });

        const firstBody: SuggestBody = await suggest(first, 500_000);
        const secondBody: SuggestBody = await suggest(second, 500_000);

        const symbols = (body: SuggestBody): string[] =>
            body.classes.flatMap((item: ClassBody) => item.assets.map((asset: AssetBody) => asset.symbol));
        expect(firstBody.totalBeforeMinor).toBe(378_000);
        expect(secondBody.totalBeforeMinor).toBe(2 * 545 * 542);
        expect(symbols(firstBody)).not.toContain('VOO');
        expect(symbols(secondBody)).not.toContain('ITUB4');
    });

    it('valor inválido dá 400', async () => {
        const account: Account = await harness.signUp('invalid');

        const statuses: number[] = [];
        for (const amountMinor of [0, -5, 1.5, 100_000_000_001]) {
            const response = await harness.call(account.token, 'POST', '/portfolio/contributions/suggest', { amountMinor });
            statuses.push(response.status);
        }
        const missing = await harness.call(account.token, 'POST', '/portfolio/contributions/suggest', {});

        expect(statuses).toEqual([400, 400, 400, 400]);
        expect(missing.status).toBe(400);
    });

    it('metas de classe zeradas dão 422 contribution.targets_not_set', async () => {
        const account: Account = await harness.signUp('no-targets');
        await harness.call(account.token, 'GET', '/allocation/classes');
        await harness.pg.query(`UPDATE "AssetClasses" SET "targetBps" = 0 WHERE "companyId" = $1`, [account.company.id]);

        const response = await harness.call<ProblemBody>(account.token, 'POST', '/portfolio/contributions/suggest', { amountMinor: 1000 });

        expect(response.status).toBe(422);
        expect(response.body.type).toBe('contribution.targets_not_set');
    });
});
