import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Account, AllocationHarness } from './support/allocation-harness';

interface PositionBody {
    readonly id: string;
    readonly assetId: string;
    readonly quantity: string;
    readonly averagePrice: string | null;
    readonly classId: string;
}

interface ProblemBody {
    readonly type: string;
    readonly status: number;
    readonly meta?: { readonly positionId?: string };
}

interface ClassBody {
    readonly id: string;
    readonly systemKey: string | null;
}

interface AssignmentRow {
    readonly deletedAt: Date | null;
    readonly classId: string;
}

interface AssetSeed {
    readonly symbol: string;
    readonly market: string;
    readonly decimals: number;
    readonly suggestedClassKey: string | null;
    readonly status?: string;
}

describe('positions', () => {
    let harness: AllocationHarness;
    const assetIds: Record<string, string> = {};

    beforeAll(async () => {
        harness = await AllocationHarness.start('positions');
        await seed({ symbol: 'VOO', market: 'US', decimals: 6, suggestedClassKey: 'acoes_eua' });
        await seed({ symbol: 'PETR4', market: 'B3', decimals: 0, suggestedClassKey: 'acoes_br' });
        await seed({ symbol: 'TESOURO', market: 'TESOURO', decimals: 2, suggestedClassKey: 'rf_pos' });
        await seed({ symbol: 'NOCLASS', market: 'US', decimals: 6, suggestedClassKey: null });
        await seed({ symbol: 'OLD', market: 'B3', decimals: 0, suggestedClassKey: 'acoes_br', status: 'delisted' });
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function seed(asset: AssetSeed): Promise<void> {
        const id: string = crypto.randomUUID();
        await harness.pg.query(
            `INSERT INTO "Assets" ("id","market","externalId","symbol","name","kind","typeGroup","suggestedClassKey","currency","quotesProvider","quantityDecimals","status")
             VALUES ($1,$2,$3,$3,$3,'stock','acoes_br',$4,'BRL','brapi',$5,$6)`,
            [id, asset.market, asset.symbol, asset.suggestedClassKey, asset.decimals, asset.status ?? 'active']
        );
        assetIds[asset.symbol] = id;
    }

    async function classes(account: Account): Promise<ClassBody[]> {
        return (await harness.call<{ data: ClassBody[] }>(account.token, 'GET', '/allocation/classes')).body.data;
    }

    async function create(account: Account, body: Record<string, unknown>): Promise<{ status: number; body: PositionBody & ProblemBody }> {
        return harness.call<PositionBody & ProblemBody>(account.token, 'POST', '/positions', body);
    }

    it('exige sessão em todas as rotas', async () => {
        const id: string = crypto.randomUUID();

        const statuses: number[] = await Promise.all([
            harness.call(null, 'POST', '/positions', {}).then((r) => r.status),
            harness.call(null, 'GET', `/positions/${id}`).then((r) => r.status),
            harness.call(null, 'PATCH', `/positions/${id}`, {}).then((r) => r.status),
            harness.call(null, 'DELETE', `/positions/${id}`).then((r) => r.status)
        ]);

        expect(statuses).toEqual([401, 401, 401, 401]);
    });

    it('cria VOO com a classe sugerida, recusa o duplicado com o id da existente e recria depois de remover', async () => {
        const account: Account = await harness.signUp('duplicate');

        const first = await create(account, { assetId: assetIds['VOO'], quantity: '40' });
        expect(first.status).toBe(201);
        const usEquities: ClassBody | undefined = (await classes(account)).find((item: ClassBody) => item.systemKey === 'acoes_eua');
        expect(first.body).toMatchObject({ assetId: assetIds['VOO'], quantity: '40', averagePrice: null, classId: usEquities?.id });

        const second = await create(account, { assetId: assetIds['VOO'], quantity: '1' });
        expect(second.status).toBe(409);
        expect(second.body.type).toBe('positions.asset_already_in_portfolio');
        expect(second.body.meta).toEqual({ positionId: first.body.id });

        expect((await harness.call(account.token, 'DELETE', `/positions/${first.body.id}`)).status).toBe(204);
        const again = await create(account, { assetId: assetIds['VOO'], quantity: '2' });
        expect(again.status).toBe(201);
        expect(again.body.id).not.toBe(first.body.id);
    });

    it('duas requisições concorrentes para o mesmo ativo resultam em um 201 e um 409', async () => {
        const account: Account = await harness.signUp('race');

        const results = await Promise.all(
            Array.from({ length: 4 }, async () => create(account, { assetId: assetIds['PETR4'], quantity: '10' }))
        );

        expect(results.map((result) => result.status).sort()).toEqual([201, 409, 409, 409]);
        const rows = await harness.pg.query('SELECT 1 FROM "Positions" WHERE "companyId" = $1 AND "deletedAt" IS NULL', [
            account.company.id
        ]);
        expect(rows.rowCount).toBe(1);
        const assignments = await harness.pg.query(
            'SELECT 1 FROM "AssetClassAssignments" WHERE "companyId" = $1 AND "deletedAt" IS NULL AND "subjectType" = \'position\'',
            [account.company.id]
        );
        expect(assignments.rowCount).toBe(1);
    });

    it('aceita quantidade zero, edita para 10 e remove liberando a atribuição', async () => {
        const account: Account = await harness.signUp('zero');

        const created = await create(account, { assetId: assetIds['PETR4'], quantity: '0', averagePrice: '36.9' });
        expect(created.status).toBe(201);
        expect(created.body).toMatchObject({ quantity: '0', averagePrice: '36.9' });

        const patched = await harness.call<PositionBody>(account.token, 'PATCH', `/positions/${created.body.id}`, { quantity: '10' });
        expect(patched.status).toBe(200);
        expect(patched.body).toMatchObject({ quantity: '10', averagePrice: '36.9' });

        const cleared = await harness.call<PositionBody>(account.token, 'PATCH', `/positions/${created.body.id}`, { averagePrice: null });
        expect(cleared.body).toMatchObject({ quantity: '10', averagePrice: null });

        const read = await harness.call<PositionBody>(account.token, 'GET', `/positions/${created.body.id}`);
        expect(read.body).toMatchObject({ id: created.body.id, quantity: '10' });

        expect((await harness.call(account.token, 'DELETE', `/positions/${created.body.id}`)).status).toBe(204);
        expect((await harness.call(account.token, 'GET', `/positions/${created.body.id}`)).status).toBe(404);
        const assignment = await harness.pg.query<AssignmentRow>(
            'SELECT "deletedAt", "classId" FROM "AssetClassAssignments" WHERE "subjectId" = $1',
            [created.body.id]
        );
        expect(assignment.rows[0]?.deletedAt).not.toBeNull();
    });

    it('valida quantidade: casas do ativo (422) e formato (400)', async () => {
        const account: Account = await harness.signUp('quantity');

        const tooPrecise = await create(account, { assetId: assetIds['TESOURO'], quantity: '3.205' });
        expect(tooPrecise.status).toBe(422);
        expect(tooPrecise.body.type).toBe('positions.invalid_quantity');
        expect((await create(account, { assetId: assetIds['PETR4'], quantity: '2000.5' })).status).toBe(422);
        expect((await create(account, { assetId: assetIds['TESOURO'], quantity: '3.2' })).status).toBe(201);

        const formats: number[] = await Promise.all(
            ['-1', '', '1e3', '1,5'].map(async (quantity: string) => (await create(account, { assetId: assetIds['VOO'], quantity })).status)
        );
        expect(formats).toEqual([400, 400, 400, 400]);

        const created = await create(account, { assetId: assetIds['VOO'], quantity: '1.5' });
        const patch = await harness.call<ProblemBody>(account.token, 'PATCH', `/positions/${created.body.id}`, { quantity: '1.1234567' });
        expect(patch.status).toBe(422);
    });

    it('exige classe quando o ativo não tem sugestão e recusa ativo delisted ou inexistente', async () => {
        const account: Account = await harness.signUp('class');

        const missing = await create(account, { assetId: assetIds['NOCLASS'], quantity: '1' });
        expect(missing.status).toBe(422);
        expect(missing.body.type).toBe('positions.class_required');

        const chosen: ClassBody = (await classes(account)).find((item: ClassBody) => item.systemKey === 'cripto') as ClassBody;
        const withClass = await create(account, { assetId: assetIds['NOCLASS'], quantity: '1', classId: chosen.id });
        expect(withClass.status).toBe(201);
        expect(withClass.body.classId).toBe(chosen.id);

        const delisted = await create(account, { assetId: assetIds['OLD'], quantity: '1' });
        expect(delisted.status).toBe(422);
        expect(delisted.body.type).toBe('positions.asset_not_available');

        const unknown = await create(account, { assetId: crypto.randomUUID(), quantity: '1' });
        expect(unknown.status).toBe(404);
        expect(unknown.body.type).toBe('catalog.asset_not_found');
    });

    it('falha ao gravar a atribuição desfaz a posição', async () => {
        const account: Account = await harness.signUp('rollback');
        const other: Account = await harness.signUp('rollback-other');
        const foreignClass: ClassBody = (await classes(other))[0] as ClassBody;

        const failed = await create(account, { assetId: assetIds['PETR4'], quantity: '5', classId: foreignClass.id });

        expect(failed.status).toBe(404);
        expect(failed.body.type).toBe('allocation.class_not_found');
        const rows = await harness.pg.query('SELECT 1 FROM "Positions" WHERE "companyId" = $1', [account.company.id]);
        expect(rows.rowCount).toBe(0);
        expect((await create(account, { assetId: assetIds['PETR4'], quantity: '5' })).status).toBe(201);
    });

    it('isola companies: a B não lê, edita nem remove a posição da A e cadastra o mesmo ativo sem conflito', async () => {
        const a: Account = await harness.signUp('tenant-a');
        const b: Account = await harness.signUp('tenant-b');
        const created = await create(a, { assetId: assetIds['VOO'], quantity: '40' });

        const read = await harness.call<ProblemBody>(b.token, 'GET', `/positions/${created.body.id}`);
        const patch = await harness.call<ProblemBody>(b.token, 'PATCH', `/positions/${created.body.id}`, { quantity: '1' });
        const remove = await harness.call<ProblemBody>(b.token, 'DELETE', `/positions/${created.body.id}`);

        expect([read.status, patch.status, remove.status]).toEqual([404, 404, 404]);
        expect(read.body.type).toBe('positions.position_not_found');
        const own = await create(b, { assetId: assetIds['VOO'], quantity: '7' });
        expect(own.status).toBe(201);
        expect(own.body.id).not.toBe(created.body.id);
        const untouched = await harness.call<PositionBody>(a.token, 'GET', `/positions/${created.body.id}`);
        expect(untouched.body.quantity).toBe('40');
    });

    it('recusa a 501ª posição da company', async () => {
        const account: Account = await harness.signUp('limit');
        const classRow = await harness.pg.query<{ id: string }>('SELECT "id" FROM "AssetClasses" WHERE "companyId" = $1 LIMIT 1', [
            account.company.id
        ]);
        const classId: string = classRow.rows[0]?.id ?? ((await classes(account))[0] as ClassBody).id;
        await harness.pg.query(
            `INSERT INTO "Assets" ("id","market","externalId","symbol","name","kind","typeGroup","currency","quotesProvider","quantityDecimals")
             SELECT gen_random_uuid(),'B3','BULK'||g,'BULK'||g,'BULK'||g,'stock','acoes_br','BRL','brapi',0 FROM generate_series(1,500) g`
        );
        const bulk = await harness.pg.query<{ id: string }>('SELECT "id" FROM "Assets" WHERE "symbol" LIKE \'BULK%\'');
        await harness.pg.query(
            `INSERT INTO "Positions" ("id","companyId","assetId","quantity")
             SELECT gen_random_uuid(), $1, unnest($2::uuid[]), 1`,
            [account.company.id, bulk.rows.map((row: { id: string }) => row.id)]
        );

        const overflow = await create(account, { assetId: assetIds['VOO'], quantity: '1', classId });

        expect(overflow.status).toBe(422);
        expect(overflow.body.type).toBe('positions.limit_reached');
    });
});
