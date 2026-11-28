import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asRole } from '../../support/as-role';
import { POSITION_SEEDS, PositionSeed } from '../../support/portfolio-fixtures';
import { Account, AllocationHarness } from '../support/allocation-harness';
import { seedAsset } from '../support/portfolio-seed';

interface Modules {
    readonly portfolio: boolean;
    readonly spending: boolean;
}

interface MeBody {
    readonly modules: Modules;
}

interface ProblemBody {
    readonly type: string;
    readonly meta?: { readonly required?: string };
}

interface ExportBody {
    readonly account: { readonly company: { readonly modules: Modules } };
}

interface CategoryBody {
    readonly id: string;
}

interface ModulesRow {
    readonly portfolioModuleEnabled: boolean;
    readonly spendingModuleEnabled: boolean;
}

const BOTH_ON: Modules = { portfolio: true, spending: true };

describe('módulos Investimentos e Gastos por conta', () => {
    let harness: AllocationHarness;
    let assetId: string;

    beforeAll(async () => {
        harness = await AllocationHarness.start('account_modules');
        const seed: PositionSeed | undefined = POSITION_SEEDS[0];
        if (!seed) {
            throw new Error('POSITION_SEEDS is empty');
        }
        assetId = await seedAsset(harness, seed, false);
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function modulesOf(account: Account): Promise<Modules> {
        return (await harness.call<MeBody>(account.token, 'GET', '/auth/me')).body.modules;
    }

    it('conta nova nasce com os dois módulos ligados, e o GET /auth/me informa', async () => {
        const owner: Account = await harness.signUp('modules_default');

        expect(await modulesOf(owner)).toEqual(BOTH_ON);
    });

    it('Dono e Editor ligam e desligam; um campo omitido fica como estava', async () => {
        const owner: Account = await harness.signUp('modules_change');
        const editor: Account = await asRole(harness, owner, 'editor');

        const off = await harness.call<Modules>(editor.token, 'PATCH', '/account/modules', { spending: false });
        expect(off.status).toBe(200);
        expect(off.body).toEqual({ portfolio: true, spending: false });
        expect(await modulesOf(owner)).toEqual({ portfolio: true, spending: false });

        const on = await harness.call<Modules>(owner.token, 'PATCH', '/account/modules', { spending: true });
        expect(on.body).toEqual(BOTH_ON);
        expect(await modulesOf(editor)).toEqual(BOTH_ON);
    });

    it('Leitura recebe 403 e nada muda', async () => {
        const owner: Account = await harness.signUp('modules_viewer');
        const viewer: Account = await asRole(harness, owner, 'viewer');

        const response = await harness.call<ProblemBody>(viewer.token, 'PATCH', '/account/modules', { portfolio: false });

        expect(response.status).toBe(403);
        expect(response.body.type).toBe('members.forbidden_role');
        expect(response.body.meta?.required).toBe('editor');
        expect(await modulesOf(owner)).toEqual(BOTH_ON);
    });

    it('desligar os dois responde 422 account.modules_empty, de uma vez ou em duas', async () => {
        const owner: Account = await harness.signUp('modules_empty');

        const both = await harness.call<ProblemBody>(owner.token, 'PATCH', '/account/modules', { portfolio: false, spending: false });
        expect(both.status).toBe(422);
        expect(both.body.type).toBe('account.modules_empty');

        expect((await harness.call(owner.token, 'PATCH', '/account/modules', { portfolio: false })).status).toBe(200);
        const last = await harness.call<ProblemBody>(owner.token, 'PATCH', '/account/modules', { spending: false });
        expect(last.status).toBe(422);
        expect(last.body.type).toBe('account.modules_empty');
        expect(await modulesOf(owner)).toEqual({ portfolio: false, spending: true });
    });

    it('corpo com campo desconhecido ou valor que não é booleano responde 400', async () => {
        const owner: Account = await harness.signUp('modules_invalid');

        expect((await harness.call(owner.token, 'PATCH', '/account/modules', { budgets: false })).status).toBe(400);
        expect((await harness.call(owner.token, 'PATCH', '/account/modules', { spending: 'no' })).status).toBe(400);
        expect((await harness.call(null, 'PATCH', '/account/modules', { spending: false })).status).toBe(401);
    });

    it('a escolha de uma conta não vaza para outra', async () => {
        const first: Account = await harness.signUp('modules_tenant_a');
        const second: Account = await harness.signUp('modules_tenant_b');

        await harness.call(first.token, 'PATCH', '/account/modules', { portfolio: false });

        expect(await modulesOf(first)).toEqual({ portfolio: false, spending: true });
        expect(await modulesOf(second)).toEqual(BOTH_ON);
    });

    it('desligar e religar mantém todos os dados, e as rotas do módulo seguem respondendo desligadas', async () => {
        const owner: Account = await harness.signUp('modules_keep');
        const position = await harness.call<{ id: string }>(owner.token, 'POST', '/positions', { assetId, quantity: '10' });
        expect(position.status).toBe(201);
        const category = await harness.call<CategoryBody>(owner.token, 'POST', '/spending/categories', {
            name: 'Pets módulos',
            kind: 'expense',
            flexibility: 'flexible',
            icon: 'Home'
        });
        expect(category.status).toBe(201);

        await harness.call(owner.token, 'PATCH', '/account/modules', { portfolio: false });
        expect((await harness.call(owner.token, 'GET', `/positions/${position.body.id}`)).status).toBe(200);
        await harness.call(owner.token, 'PATCH', '/account/modules', { portfolio: true, spending: false });
        const categories = await harness.call<{ categories: CategoryBody[] }>(owner.token, 'GET', '/spending/categories');
        expect(categories.status).toBe(200);
        await harness.call(owner.token, 'PATCH', '/account/modules', { spending: true });

        expect(await modulesOf(owner)).toEqual(BOTH_ON);
        expect((await harness.call(owner.token, 'GET', `/positions/${position.body.id}`)).status).toBe(200);
        const after = await harness.call<{ categories: CategoryBody[] }>(owner.token, 'GET', '/spending/categories');
        expect(after.body.categories.map((item: CategoryBody) => item.id)).toContain(category.body.id);
        const positions = await harness.pg.query('SELECT 1 FROM "Positions" WHERE "companyId" = $1 AND "deletedAt" IS NULL', [
            owner.company.id
        ]);
        expect(positions.rowCount).toBe(1);
    });

    it('a exportação da conta inclui os módulos', async () => {
        const owner: Account = await harness.signUp('modules_export');
        await harness.call(owner.token, 'PATCH', '/account/modules', { spending: false });

        const exported = await harness.call<ExportBody>(owner.token, 'GET', '/account/export');

        expect(exported.status).toBe(200);
        expect(exported.body.account.company.modules).toEqual({ portfolio: true, spending: false });
    });

    it('a exclusão da conta apaga a linha com os módulos', async () => {
        const owner: Account = await harness.signUp('modules_erase');
        await harness.call(owner.token, 'PATCH', '/account/modules', { portfolio: false });
        const before = await harness.pg.query<ModulesRow>(
            'SELECT "portfolioModuleEnabled", "spendingModuleEnabled" FROM "Companies" WHERE "id" = $1',
            [owner.company.id]
        );
        expect(before.rows).toEqual([{ portfolioModuleEnabled: false, spendingModuleEnabled: true }]);

        const deleted = await harness.call(owner.token, 'DELETE', '/account', { confirmEmail: owner.user.email });

        expect(deleted.status).toBe(204);
        const after = await harness.pg.query('SELECT 1 FROM "Companies" WHERE "id" = $1', [owner.company.id]);
        expect(after.rowCount).toBe(0);
    });

    it('o banco recusa uma conta com os dois módulos desligados', async () => {
        const owner: Account = await harness.signUp('modules_check');

        await expect(
            harness.pg.query('UPDATE "Companies" SET "portfolioModuleEnabled" = false, "spendingModuleEnabled" = false WHERE "id" = $1', [
                owner.company.id
            ])
        ).rejects.toThrow(/Companies_modules_not_empty/);
    });
});
