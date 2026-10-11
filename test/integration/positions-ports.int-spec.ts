import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Account, AllocationHarness } from './support/allocation-harness';

interface SummaryBody {
    readonly assets: { readonly items: number; readonly amountCents: number | null; readonly currency: string | null } | null;
}

interface ExportBody {
    readonly sections: {
        readonly positions?: {
            readonly symbol: string | null;
            readonly quantity: string;
            readonly averagePrice: string | null;
            readonly classId: string | null;
        }[];
    };
}

interface PositionBody {
    readonly id: string;
}

describe('positions ports', () => {
    let harness: AllocationHarness;
    const assetIds: Record<string, string> = {};

    beforeAll(async () => {
        harness = await AllocationHarness.start('positions_ports');
        const seeds: [string, string, string][] = [
            ['B3', 'ITUB4', 'acoes_br'],
            ['B3', 'WEGE3', 'acoes_br'],
            ['B3', 'HGLG11', 'fii'],
            ['US', 'VOO', 'acoes_eua'],
            ['B3', 'PETR4', 'acoes_br']
        ];
        for (const [market, symbol, classKey] of seeds) {
            const id: string = crypto.randomUUID();
            await harness.pg.query(
                `INSERT INTO "Assets" ("id","market","externalId","symbol","name","kind","typeGroup","suggestedClassKey","currency","quotesProvider","quantityDecimals")
                 VALUES ($1,$2,$3,$3,$3,'stock','acoes_br',$4,'BRL','brapi',6)`,
                [id, market, symbol, classKey]
            );
            assetIds[symbol] = id;
        }
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function summary(account: Account): Promise<SummaryBody> {
        return (await harness.call<SummaryBody>(account.token, 'GET', '/onboarding/summary')).body;
    }

    async function add(account: Account, symbol: string, quantity: string): Promise<string> {
        const response = await harness.call<PositionBody>(account.token, 'POST', '/positions', { assetId: assetIds[symbol], quantity });
        expect(response.status).toBe(201);
        return response.body.id;
    }

    it('resumo da área assets conta posições reais, com valor nulo até a consolidação', async () => {
        const account: Account = await harness.signUp('summary');
        expect((await summary(account)).assets).toEqual({ items: 0, amountCents: null, currency: null });

        await add(account, 'PETR4', '10');
        await add(account, 'VOO', '2');

        expect((await summary(account)).assets).toEqual({ items: 2, amountCents: null, currency: null });
    });

    it('exporta só as posições da company, com símbolo e classe', async () => {
        const a: Account = await harness.signUp('export-a');
        const b: Account = await harness.signUp('export-b');
        await add(a, 'PETR4', '10');
        await add(b, 'VOO', '99');

        const response = await harness.call<ExportBody>(a.token, 'GET', '/account/export');

        expect(response.status).toBe(200);
        expect(response.body.sections.positions).toEqual([
            {
                symbol: 'PETR4',
                name: 'PETR4',
                quantity: '10',
                averagePrice: null,
                classId: expect.any(String),
                createdAt: expect.any(String)
            }
        ]);
        expect(JSON.stringify(response.body)).not.toContain(b.company.id);
    });

    it('exemplo: carrega posições marcadas, é idempotente, fica fora de resumo e exportação e some ao limpar', async () => {
        const account: Account = await harness.signUp('sample');

        const first = await harness.call(account.token, 'POST', '/onboarding/sample');
        expect(first.status).toBe(200);
        const second = await harness.call(account.token, 'POST', '/onboarding/sample');
        expect(second.status).toBe(200);

        const samples = await harness.pg.query<{ symbol: string; isSample: boolean }>(
            `SELECT a."symbol", p."isSample" FROM "Positions" p JOIN "Assets" a ON a."id" = p."assetId" WHERE p."companyId" = $1 AND p."deletedAt" IS NULL ORDER BY a."symbol"`,
            [account.company.id]
        );
        expect(samples.rows).toEqual([
            { symbol: 'HGLG11', isSample: true },
            { symbol: 'ITUB4', isSample: true },
            { symbol: 'VOO', isSample: true },
            { symbol: 'WEGE3', isSample: true }
        ]);
        const assignments = await harness.pg.query(
            'SELECT 1 FROM "AssetClassAssignments" WHERE "companyId" = $1 AND "deletedAt" IS NULL AND "isSample" = true AND "subjectType" = \'position\'',
            [account.company.id]
        );
        expect(assignments.rowCount).toBe(4);
        expect((await summary(account)).assets?.items).toBe(0);
        const exported = await harness.call<ExportBody>(account.token, 'GET', '/account/export');
        expect(exported.body.sections.positions).toEqual([]);

        expect((await harness.call(account.token, 'DELETE', '/onboarding/sample')).status).toBe(200);
        expect((await harness.call(account.token, 'DELETE', '/onboarding/sample')).status).toBe(200);
        const left = await harness.pg.query('SELECT 1 FROM "Positions" WHERE "companyId" = $1 AND "deletedAt" IS NULL', [
            account.company.id
        ]);
        expect(left.rowCount).toBe(0);
        const released = await harness.pg.query('SELECT 1 FROM "AssetClassAssignments" WHERE "companyId" = $1 AND "deletedAt" IS NULL', [
            account.company.id
        ]);
        expect(released.rowCount).toBe(0);
    });

    it('exemplo não mistura com dado real e a limpeza nunca toca posição real', async () => {
        const account: Account = await harness.signUp('sample-real');
        const real: string = await add(account, 'PETR4', '10');

        expect((await harness.call(account.token, 'POST', '/onboarding/sample')).status).toBe(200);
        const afterSeed = await harness.pg.query('SELECT 1 FROM "Positions" WHERE "companyId" = $1 AND "deletedAt" IS NULL', [
            account.company.id
        ]);
        expect(afterSeed.rowCount).toBe(1);

        expect((await harness.call(account.token, 'DELETE', '/onboarding/sample')).status).toBe(200);
        expect((await harness.call(account.token, 'GET', `/positions/${real}`)).status).toBe(200);
    });

    it('excluir a conta leva as posições pela cascata, sem eraser', async () => {
        const account: Account = await harness.signUp('erase');
        await add(account, 'PETR4', '10');
        await harness.call(account.token, 'POST', '/onboarding/sample');

        const deleted = await harness.call(account.token, 'DELETE', '/account', { confirmEmail: account.user.email });

        expect(deleted.status).toBeLessThan(300);
        const rows = await harness.pg.query('SELECT 1 FROM "Positions" WHERE "companyId" = $1', [account.company.id]);
        expect(rows.rowCount).toBe(0);
    });
});
