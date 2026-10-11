import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Account, AllocationHarness } from './support/allocation-harness';
import { DriverRegistration, registerFakeDriver } from './support/recategorization-fake';

interface CategoryBody {
    readonly id: string;
    readonly systemKey: string | null;
    readonly name: string | null;
    readonly kind: string;
    readonly flexibility: string | null;
    readonly icon: string;
    readonly position: number;
    readonly isSystem: boolean;
}

interface ListBody {
    readonly categories: CategoryBody[];
}

interface ProblemBody {
    readonly type: string;
    readonly meta?: Record<string, unknown>;
}

interface ExportBody {
    readonly sections: Record<string, { categories: CategoryBody[]; rules: unknown[] }>;
}

describe('spending categories', () => {
    let harness: AllocationHarness;

    beforeAll(async () => {
        harness = await AllocationHarness.start('spending_categories');
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function list(account: Account): Promise<CategoryBody[]> {
        return (await harness.call<ListBody>(account.token, 'GET', '/spending/categories')).body.categories;
    }

    function byKey(categories: CategoryBody[], systemKey: string): CategoryBody {
        return categories.find((item: CategoryBody) => item.systemKey === systemKey) as CategoryBody;
    }

    async function createExpense(account: Account, name: string): Promise<CategoryBody> {
        const created = await harness.call<CategoryBody>(account.token, 'POST', '/spending/categories', {
            name,
            kind: 'expense',
            flexibility: 'flexible',
            icon: 'PawPrint'
        });
        expect(created.status).toBe(201);
        return created.body;
    }

    it('exige sessão em todas as rotas', async () => {
        const id: string = crypto.randomUUID();

        const statuses: number[] = await Promise.all([
            harness.call(null, 'GET', '/spending/categories').then((r) => r.status),
            harness.call(null, 'POST', '/spending/categories', {}).then((r) => r.status),
            harness.call(null, 'PATCH', `/spending/categories/${id}`, {}).then((r) => r.status),
            harness.call(null, 'DELETE', `/spending/categories/${id}`).then((r) => r.status)
        ]);

        expect(statuses).toEqual([401, 401, 401, 401]);
    });

    it('a primeira leitura semeia as 17 categorias padrão e a segunda não duplica', async () => {
        const account: Account = await harness.signUp('defaults');

        const first: CategoryBody[] = await list(account);
        const second: CategoryBody[] = await list(account);

        expect(first).toHaveLength(17);
        expect(second.map((item: CategoryBody) => item.id)).toEqual(first.map((item: CategoryBody) => item.id));
        expect(first.map((item: CategoryBody) => item.position)).toEqual(
            Array.from({ length: 17 }, (_unused: unknown, index: number) => index + 1)
        );
        expect(first.every((item: CategoryBody) => item.isSystem && item.name === null)).toBe(true);
        expect(first.filter((item: CategoryBody) => item.flexibility === 'fixed').map((item: CategoryBody) => item.systemKey)).toEqual([
            'housing',
            'education',
            'health',
            'home_services',
            'taxes_fees'
        ]);
        expect(first.filter((item: CategoryBody) => item.kind === 'transfer').map((item: CategoryBody) => item.systemKey)).toEqual([
            'own_transfer',
            'card_payment',
            'investments'
        ]);
        expect(first.filter((item: CategoryBody) => item.kind === 'income')).toHaveLength(2);
        expect(byKey(first, 'income').flexibility).toBeNull();
    });

    it('leituras concorrentes na primeira vez não duplicam as categorias padrão', async () => {
        const account: Account = await harness.signUp('concurrent');

        const reads: CategoryBody[][] = await Promise.all(Array.from({ length: 6 }, async () => list(account)));

        expect(reads.every((categories: CategoryBody[]) => categories.length === 17)).toBe(true);
        const count = await harness.pg.query<{ total: string }>(
            'SELECT count(*) AS total FROM "SpendingCategories" WHERE "companyId" = $1',
            [account.company.id]
        );
        expect(count.rows[0]?.total).toBe('17');
    });

    it('cria, renomeia, troca a flexibilidade e exclui uma categoria do usuário', async () => {
        const account: Account = await harness.signUp('crud');
        await list(account);

        const created: CategoryBody = await createExpense(account, '  Pets  ');
        expect(created).toMatchObject({
            name: 'Pets',
            kind: 'expense',
            flexibility: 'flexible',
            icon: 'PawPrint',
            isSystem: false,
            position: 18
        });

        const renamed = await harness.call<CategoryBody>(account.token, 'PATCH', `/spending/categories/${created.id}`, {
            name: 'Bichos',
            flexibility: 'fixed',
            icon: 'Gift'
        });
        expect(renamed.status).toBe(200);
        expect(renamed.body).toMatchObject({ name: 'Bichos', flexibility: 'fixed', icon: 'Gift' });

        const removed = await harness.call<{ recategorized: number }>(account.token, 'DELETE', `/spending/categories/${created.id}`);
        expect(removed).toMatchObject({ status: 200, body: { recategorized: 0 } });
        expect((await list(account)).some((item: CategoryBody) => item.id === created.id)).toBe(false);
    });

    it('renomeia uma categoria padrão, volta ao nome traduzido com null e troca a flexibilidade', async () => {
        const account: Account = await harness.signUp('rename-default');
        const housing: CategoryBody = byKey(await list(account), 'housing');

        const renamed = await harness.call<CategoryBody>(account.token, 'PATCH', `/spending/categories/${housing.id}`, { name: 'Casa' });
        const flexible = await harness.call<CategoryBody>(account.token, 'PATCH', `/spending/categories/${housing.id}`, {
            flexibility: 'flexible'
        });
        const restored = await harness.call<CategoryBody>(account.token, 'PATCH', `/spending/categories/${housing.id}`, { name: null });

        expect(renamed.body).toMatchObject({ name: 'Casa', systemKey: 'housing' });
        expect(flexible.body.flexibility).toBe('flexible');
        expect(restored.body).toMatchObject({ name: null, systemKey: 'housing', flexibility: 'flexible' });
    });

    it('a padrão não é excluída, não troca de ícone e renda não tem flexibilidade', async () => {
        const account: Account = await harness.signUp('locked');
        const categories: CategoryBody[] = await list(account);
        const housing: CategoryBody = byKey(categories, 'housing');
        const income: CategoryBody = byKey(categories, 'income');

        const remove = await harness.call<ProblemBody>(account.token, 'DELETE', `/spending/categories/${housing.id}`);
        const icon = await harness.call<ProblemBody>(account.token, 'PATCH', `/spending/categories/${housing.id}`, { icon: 'Car' });
        const flexibility = await harness.call<ProblemBody>(account.token, 'PATCH', `/spending/categories/${income.id}`, {
            flexibility: 'fixed'
        });
        const kind = await harness.call<ProblemBody>(account.token, 'PATCH', `/spending/categories/${housing.id}`, { kind: 'income' });

        expect([remove.status, remove.body.type]).toEqual([422, 'categories.system_category_locked']);
        expect([icon.status, icon.body.type]).toEqual([422, 'categories.system_category_locked']);
        expect([flexibility.status, flexibility.body.type]).toEqual([422, 'categories.flexibility_not_applicable']);
        expect(kind.status).toBe(400);
    });

    it('recusa nome repetido sem diferenciar maiúsculas e nome nulo em categoria do usuário', async () => {
        const account: Account = await harness.signUp('names');
        await list(account);
        const mine: CategoryBody = await createExpense(account, 'Pets');

        const duplicate = await harness.call<ProblemBody>(account.token, 'POST', '/spending/categories', {
            name: ' PETS ',
            kind: 'income',
            icon: 'Home'
        });
        const clash = await createExpense(account, 'Outra');
        const rename = await harness.call<ProblemBody>(account.token, 'PATCH', `/spending/categories/${clash.id}`, { name: 'pets' });
        const nullName = await harness.call<ProblemBody>(account.token, 'PATCH', `/spending/categories/${mine.id}`, { name: null });

        expect([duplicate.status, duplicate.body.type]).toEqual([409, 'categories.name_taken']);
        expect([rename.status, rename.body.type]).toEqual([409, 'categories.name_taken']);
        expect([nullName.status, nullName.body.type]).toEqual([422, 'categories.name_required']);
    });

    it('o nome de uma categoria excluída pode ser reaproveitado', async () => {
        const account: Account = await harness.signUp('reuse');
        await list(account);
        const first: CategoryBody = await createExpense(account, 'Pets');
        await harness.call(account.token, 'DELETE', `/spending/categories/${first.id}`);

        const again = await harness.call<CategoryBody>(account.token, 'POST', '/spending/categories', {
            name: 'Pets',
            kind: 'expense',
            flexibility: 'fixed',
            icon: 'Home'
        });

        expect(again.status).toBe(201);
    });

    it('valida o corpo: despesa sem flexibilidade, transferência, ícone fora da lista, nome longo e id inválido', async () => {
        const account: Account = await harness.signUp('validation');

        const statuses: number[] = await Promise.all([
            harness.call(account.token, 'POST', '/spending/categories', { name: 'X', kind: 'expense', icon: 'Home' }).then((r) => r.status),
            harness
                .call(account.token, 'POST', '/spending/categories', { name: 'X', kind: 'transfer', icon: 'Home' })
                .then((r) => r.status),
            harness
                .call(account.token, 'POST', '/spending/categories', { name: 'X', kind: 'income', icon: 'Rocket' })
                .then((r) => r.status),
            harness
                .call(account.token, 'POST', '/spending/categories', { name: 'x'.repeat(41), kind: 'income', icon: 'Home' })
                .then((r) => r.status),
            harness.call(account.token, 'PATCH', '/spending/categories/not-a-uuid', { name: 'Ok' }).then((r) => r.status),
            harness.call(account.token, 'DELETE', `/spending/categories/${crypto.randomUUID()}?moveTo=nope`).then((r) => r.status)
        ]);

        expect(statuses).toEqual([400, 400, 400, 400, 400, 400]);
    });

    it('limita a company a 50 categorias próprias', async () => {
        const account: Account = await harness.signUp('limit');
        await list(account);
        await harness.pg.query(
            `INSERT INTO "SpendingCategories" ("id", "companyId", "name", "kind", "flexibility", "icon", "position")
             SELECT gen_random_uuid(), $1, 'Categoria ' || n, 'expense', 'flexible', 'Home', 17 + n FROM generate_series(1, 49) AS n`,
            [account.company.id]
        );

        const fiftieth = await harness.call(account.token, 'POST', '/spending/categories', {
            name: 'Quinquagésima',
            kind: 'income',
            icon: 'Home'
        });
        const overflow = await harness.call<ProblemBody>(account.token, 'POST', '/spending/categories', {
            name: 'Demais',
            kind: 'income',
            icon: 'Home'
        });

        expect(fiftieth.status).toBe(201);
        expect([overflow.status, overflow.body.type]).toEqual([422, 'categories.limit_reached']);
    });

    it('excluir com moveTo manda o destino à porta e exclui as regras da categoria', async () => {
        const account: Account = await harness.signUp('delete-move');
        const categories: CategoryBody[] = await list(account);
        const pets: CategoryBody = await createExpense(account, 'Pets');
        const gifts: CategoryBody = await createExpense(account, 'Presentes');
        await harness.call(account.token, 'POST', '/spending/rules', {
            matchType: 'contains',
            pattern: 'petz',
            appliesTo: 'out',
            categoryId: pets.id
        });
        const registration: DriverRegistration = registerFakeDriver(harness.app, 11, 0);

        try {
            const removed = await harness.call<{ recategorized: number }>(
                account.token,
                'DELETE',
                `/spending/categories/${pets.id}?moveTo=${gifts.id}`
            );

            expect(removed).toMatchObject({ status: 200, body: { recategorized: 11 } });
            expect(registration.driver.scopes).toEqual([{ kind: 'category_removed', categoryId: pets.id, moveToCategoryId: gifts.id }]);
        } finally {
            registration.restore();
        }
        const rules = await harness.call<{ rules: unknown[] }>(account.token, 'GET', '/spending/rules');
        expect(rules.body.rules).toEqual([]);
        expect(categories).toHaveLength(17);
    });

    it('excluir sem driver registrado devolve 0 e recusa destino de outra natureza, o próprio id e destino inexistente', async () => {
        const account: Account = await harness.signUp('delete-guards');
        const categories: CategoryBody[] = await list(account);
        const pets: CategoryBody = await createExpense(account, 'Pets');

        const mismatch = await harness.call<ProblemBody>(
            account.token,
            'DELETE',
            `/spending/categories/${pets.id}?moveTo=${byKey(categories, 'income').id}`
        );
        const self = await harness.call<ProblemBody>(account.token, 'DELETE', `/spending/categories/${pets.id}?moveTo=${pets.id}`);
        const missing = await harness.call<ProblemBody>(
            account.token,
            'DELETE',
            `/spending/categories/${pets.id}?moveTo=${crypto.randomUUID()}`
        );
        const removed = await harness.call<{ recategorized: number }>(account.token, 'DELETE', `/spending/categories/${pets.id}`);

        expect([mismatch.status, mismatch.body.type]).toEqual([422, 'transactions.category_kind_mismatch']);
        expect([self.status, self.body.type]).toEqual([404, 'categories.category_not_found']);
        expect([missing.status, missing.body.type]).toEqual([404, 'categories.category_not_found']);
        expect(removed).toMatchObject({ status: 200, body: { recategorized: 0 } });
    });

    it('isolamento: a company B não lê, edita nem exclui categoria da A, e as padrão de B são próprias', async () => {
        const accountA: Account = await harness.signUp('iso-a');
        const accountB: Account = await harness.signUp('iso-b');
        const fromA: CategoryBody = await createExpense(accountA, 'Só da A');
        const defaultsA: CategoryBody[] = await list(accountA);

        const listB: CategoryBody[] = await list(accountB);
        const patch = await harness.call<ProblemBody>(accountB.token, 'PATCH', `/spending/categories/${fromA.id}`, { name: 'Invadida' });
        const remove = await harness.call<ProblemBody>(accountB.token, 'DELETE', `/spending/categories/${fromA.id}`);
        const moveInto = await harness.call<ProblemBody>(
            accountB.token,
            'DELETE',
            `/spending/categories/${byKey(listB, 'groceries').id}?moveTo=${fromA.id}`
        );

        expect(listB).toHaveLength(17);
        expect(listB.some((item: CategoryBody) => item.id === fromA.id)).toBe(false);
        expect(
            listB.map((item: CategoryBody) => item.id).filter((id: string) => defaultsA.some((other: CategoryBody) => other.id === id))
        ).toEqual([]);
        expect([patch.status, patch.body.type]).toEqual([404, 'categories.category_not_found']);
        expect([remove.status, remove.body.type]).toEqual([404, 'categories.category_not_found']);
        expect(moveInto.status).toBe(422);
        expect((await list(accountA)).some((item: CategoryBody) => item.id === fromA.id && item.name === 'Só da A')).toBe(true);
    });

    it('a exportação da conta inclui as categorias e as regras, sem a chave do favorecido', async () => {
        const account: Account = await harness.signUp('export');
        const pets: CategoryBody = await createExpense(account, 'Pets');
        await harness.call(account.token, 'POST', '/spending/rules', {
            matchType: 'contains',
            pattern: 'petz',
            appliesTo: 'out',
            categoryId: pets.id
        });

        const exported = await harness.call<ExportBody>(account.token, 'GET', '/account/export');

        expect(exported.status).toBe(200);
        expect(exported.body.sections['spending_categories']?.categories).toHaveLength(18);
        expect(exported.body.sections['spending_categories']?.rules).toHaveLength(1);
    });
});
