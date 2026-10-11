import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CategoryRuleService } from '../../src/modules/spending-categories/services/category-rule.service';
import { TransactionCategorizerService } from '../../src/modules/spending-categories/services/transaction-categorizer.service';
import { Account, AllocationHarness } from './support/allocation-harness';
import { DriverRegistration, registerFakeDriver } from './support/recategorization-fake';

interface CategoryBody {
    readonly id: string;
    readonly systemKey: string | null;
}

interface RuleBody {
    readonly id: string;
    readonly matchType: string;
    readonly label: string;
    readonly appliesTo: string;
    readonly categoryId: string;
}

interface SavedBody {
    readonly rule: RuleBody;
    readonly recategorized: number;
}

interface ProblemBody {
    readonly type: string;
    readonly meta?: { ruleId?: string };
}

describe('spending rules', () => {
    let harness: AllocationHarness;

    beforeAll(async () => {
        harness = await AllocationHarness.start('spending_rules');
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function categories(account: Account): Promise<CategoryBody[]> {
        return (await harness.call<{ categories: CategoryBody[] }>(account.token, 'GET', '/spending/categories')).body.categories;
    }

    async function categoryId(account: Account, systemKey: string): Promise<string> {
        const found: CategoryBody | undefined = (await categories(account)).find((item: CategoryBody) => item.systemKey === systemKey);
        return (found as CategoryBody).id;
    }

    async function createRule(account: Account, body: Record<string, unknown>): Promise<{ status: number; body: SavedBody }> {
        return harness.call<SavedBody>(account.token, 'POST', '/spending/rules', body);
    }

    it('exige sessão em todas as rotas', async () => {
        const id: string = crypto.randomUUID();

        const statuses: number[] = await Promise.all([
            harness.call(null, 'GET', '/spending/rules').then((r) => r.status),
            harness.call(null, 'POST', '/spending/rules', {}).then((r) => r.status),
            harness.call(null, 'POST', '/spending/rules/preview', {}).then((r) => r.status),
            harness.call(null, 'PATCH', `/spending/rules/${id}`, {}).then((r) => r.status),
            harness.call(null, 'DELETE', `/spending/rules/${id}`).then((r) => r.status)
        ]);

        expect(statuses).toEqual([401, 401, 401, 401, 401]);
    });

    it('cria a regra com o padrão normalizado e sem driver registrado a contagem vem 0', async () => {
        const account: Account = await harness.signUp('create');
        const groceries: string = await categoryId(account, 'groceries');

        const created = await createRule(account, {
            matchType: 'contains',
            pattern: 'Padaria *Estrela 1234',
            appliesTo: 'out',
            categoryId: groceries
        });

        expect(created.status).toBe(201);
        expect(created.body).toMatchObject({
            recategorized: 0,
            rule: { matchType: 'contains', label: 'Padaria *Estrela 1234', appliesTo: 'out', categoryId: groceries }
        });
        const stored = await harness.pg.query<{ pattern: string }>('SELECT "pattern" FROM "CategoryRules" WHERE "id" = $1', [
            created.body.rule.id
        ]);
        expect(stored.rows[0]?.pattern).toBe('PADARIA ESTRELA');
    });

    it('com applyToPast chama a porta e devolve a contagem do driver; sem applyToPast não chama', async () => {
        const account: Account = await harness.signUp('apply');
        const groceries: string = await categoryId(account, 'groceries');
        const registration: DriverRegistration = registerFakeDriver(harness.app, 13, 0);

        try {
            const applied = await createRule(account, {
                matchType: 'contains',
                pattern: 'mercadinho',
                appliesTo: 'any',
                categoryId: groceries
            });
            const skipped = await createRule(account, {
                matchType: 'description',
                pattern: 'mercadinho do ze',
                appliesTo: 'any',
                categoryId: groceries,
                applyToPast: false
            });

            expect(applied.body.recategorized).toBe(13);
            expect(skipped.body.recategorized).toBe(0);
            expect(registration.driver.scopes).toEqual([{ kind: 'rule_saved', ruleId: applied.body.rule.id }]);
        } finally {
            registration.restore();
        }
    });

    it('regra duplicada devolve 409 com meta.ruleId da existente', async () => {
        const account: Account = await harness.signUp('conflict');
        const groceries: string = await categoryId(account, 'groceries');
        const first = await createRule(account, { matchType: 'contains', pattern: 'padaria', appliesTo: 'out', categoryId: groceries });

        const duplicate = await harness.call<ProblemBody>(account.token, 'POST', '/spending/rules', {
            matchType: 'contains',
            pattern: ' PADARIA ',
            appliesTo: 'out',
            categoryId: groceries
        });
        const otherDirection = await createRule(account, {
            matchType: 'contains',
            pattern: 'padaria',
            appliesTo: 'any',
            categoryId: groceries
        });

        expect([duplicate.status, duplicate.body.type, duplicate.body.meta?.ruleId]).toEqual([
            409,
            'categories.rule_conflict',
            first.body.rule.id
        ]);
        expect(otherDirection.status).toBe(201);
    });

    it('a regra excluída libera o padrão para uma nova', async () => {
        const account: Account = await harness.signUp('recreate');
        const groceries: string = await categoryId(account, 'groceries');
        const first = await createRule(account, { matchType: 'contains', pattern: 'padaria', appliesTo: 'out', categoryId: groceries });
        await harness.call(account.token, 'DELETE', `/spending/rules/${first.body.rule.id}`);

        const again = await createRule(account, { matchType: 'contains', pattern: 'padaria', appliesTo: 'out', categoryId: groceries });

        expect(again.status).toBe(201);
    });

    it('prévia normaliza o padrão, conta pela porta e não grava', async () => {
        const account: Account = await harness.signUp('preview');
        const withoutDriver = await harness.call<{ normalizedPattern: string; matches: number }>(
            account.token,
            'POST',
            '/spending/rules/preview',
            {
                matchType: 'contains',
                pattern: 'Uber *Trip',
                appliesTo: 'out'
            }
        );
        const registration: DriverRegistration = registerFakeDriver(harness.app, 0, 21);

        try {
            const withDriver = await harness.call<{ normalizedPattern: string; matches: number }>(
                account.token,
                'POST',
                '/spending/rules/preview',
                {
                    matchType: 'contains',
                    pattern: 'Uber *Trip',
                    appliesTo: 'out'
                }
            );

            expect(withDriver.body).toEqual({ normalizedPattern: 'UBER TRIP', matches: 21 });
            expect(registration.driver.matchers).toEqual([{ matchType: 'contains', pattern: 'UBER TRIP', appliesTo: 'out' }]);
        } finally {
            registration.restore();
        }
        expect(withoutDriver.body).toEqual({ normalizedPattern: 'UBER TRIP', matches: 0 });
        const rules = await harness.call<{ rules: RuleBody[] }>(account.token, 'GET', '/spending/rules');
        expect(rules.body.rules).toEqual([]);
    });

    it('padrão inválido dá 422, categoria inexistente dá 404 e corpo inválido dá 400', async () => {
        const account: Account = await harness.signUp('invalid');
        const groceries: string = await categoryId(account, 'groceries');

        const tooShort = await harness.call<ProblemBody>(account.token, 'POST', '/spending/rules', {
            matchType: 'contains',
            pattern: 'a',
            appliesTo: 'out',
            categoryId: groceries
        });
        const onlyDigits = await harness.call<ProblemBody>(account.token, 'POST', '/spending/rules/preview', {
            matchType: 'description',
            pattern: '12345678',
            appliesTo: 'out'
        });
        const noCategory = await harness.call<ProblemBody>(account.token, 'POST', '/spending/rules', {
            matchType: 'contains',
            pattern: 'padaria',
            appliesTo: 'out',
            categoryId: crypto.randomUUID()
        });
        const counterparty = await harness.call(account.token, 'POST', '/spending/rules', {
            matchType: 'counterparty',
            pattern: 'padaria',
            appliesTo: 'out',
            categoryId: groceries
        });

        expect([tooShort.status, tooShort.body.type]).toEqual([422, 'categories.invalid_rule']);
        expect([onlyDigits.status, onlyDigits.body.type]).toEqual([422, 'categories.invalid_rule']);
        expect([noCategory.status, noCategory.body.type]).toEqual([404, 'categories.category_not_found']);
        expect(counterparty.status).toBe(400);
    });

    it('limita a company a 500 regras', async () => {
        const account: Account = await harness.signUp('limit');
        const groceries: string = await categoryId(account, 'groceries');
        await harness.pg.query(
            `INSERT INTO "CategoryRules" ("id", "companyId", "categoryId", "matchType", "pattern", "label", "appliesTo")
             SELECT gen_random_uuid(), $1, $2, 'contains', 'PADRAO ' || n, 'padrao ' || n, 'any' FROM generate_series(1, 500) AS n`,
            [account.company.id, groceries]
        );

        const overflow = await harness.call<ProblemBody>(account.token, 'POST', '/spending/rules', {
            matchType: 'contains',
            pattern: 'um a mais',
            appliesTo: 'out',
            categoryId: groceries
        });

        expect([overflow.status, overflow.body.type]).toEqual([422, 'categories.limit_reached']);
    });

    it('lista, edita a categoria e a direção e exclui, sempre recategorizando pela porta', async () => {
        const account: Account = await harness.signUp('lifecycle');
        const groceries: string = await categoryId(account, 'groceries');
        const transport: string = await categoryId(account, 'transport');
        const first = await createRule(account, { matchType: 'contains', pattern: 'primeira', appliesTo: 'out', categoryId: groceries });
        const second = await createRule(account, { matchType: 'contains', pattern: 'segunda', appliesTo: 'out', categoryId: groceries });
        const registration: DriverRegistration = registerFakeDriver(harness.app, 5, 0);

        try {
            const listed = await harness.call<{ rules: RuleBody[] }>(account.token, 'GET', '/spending/rules');
            const patched = await harness.call<SavedBody>(account.token, 'PATCH', `/spending/rules/${first.body.rule.id}`, {
                categoryId: transport,
                appliesTo: 'in'
            });
            const removed = await harness.call<{ recategorized: number }>(
                account.token,
                'DELETE',
                `/spending/rules/${second.body.rule.id}`
            );

            expect(listed.body.rules.map((rule: RuleBody) => rule.id)).toEqual([second.body.rule.id, first.body.rule.id]);
            expect(patched.body).toMatchObject({ recategorized: 5, rule: { categoryId: transport, appliesTo: 'in' } });
            expect(removed.body.recategorized).toBe(5);
            expect(registration.driver.scopes).toEqual([
                { kind: 'rule_saved', ruleId: first.body.rule.id },
                { kind: 'rule_removed', ruleId: second.body.rule.id }
            ]);
        } finally {
            registration.restore();
        }
        const after = await harness.call<{ rules: RuleBody[] }>(account.token, 'GET', '/spending/rules');
        expect(after.body.rules.map((rule: RuleBody) => rule.id)).toEqual([first.body.rule.id]);
    });

    it('mudar a direção para uma combinação já ocupada devolve 409', async () => {
        const account: Account = await harness.signUp('patch-conflict');
        const groceries: string = await categoryId(account, 'groceries');
        await createRule(account, { matchType: 'contains', pattern: 'padaria', appliesTo: 'any', categoryId: groceries });
        const other = await createRule(account, { matchType: 'contains', pattern: 'padaria', appliesTo: 'out', categoryId: groceries });

        const conflict = await harness.call<ProblemBody>(account.token, 'PATCH', `/spending/rules/${other.body.rule.id}`, {
            appliesTo: 'any'
        });
        const missingCategory = await harness.call<ProblemBody>(account.token, 'PATCH', `/spending/rules/${other.body.rule.id}`, {
            categoryId: crypto.randomUUID()
        });

        expect([conflict.status, conflict.body.type]).toEqual([409, 'categories.rule_conflict']);
        expect([missingCategory.status, missingCategory.body.type]).toEqual([404, 'categories.category_not_found']);
    });

    it('regra de categoria excluída some da lista e deixa de valer no categorizador', async () => {
        const account: Account = await harness.signUp('category-removed');
        const pets = await harness.call<CategoryBody>(account.token, 'POST', '/spending/categories', {
            name: 'Pets',
            kind: 'expense',
            flexibility: 'flexible',
            icon: 'PawPrint'
        });
        await createRule(account, { matchType: 'contains', pattern: 'petz', appliesTo: 'out', categoryId: pets.body.id });
        const categorizer: TransactionCategorizerService = harness.app.get(TransactionCategorizerService, { strict: false });
        const input = { amountMinor: -5000, normalizedDescription: 'PETZ BOTAFOGO', counterpartyKey: null, providerCategoryId: null };

        const before = await harness.inCompany(account.company.id, async () => categorizer.categorize(input));
        await harness.call(account.token, 'DELETE', `/spending/categories/${pets.body.id}`);
        const after = await harness.inCompany(account.company.id, async () => categorizer.categorize(input));
        const rules = await harness.call<{ rules: RuleBody[] }>(account.token, 'GET', '/spending/rules');

        expect(before).toMatchObject({ categoryId: pets.body.id, source: 'rule' });
        expect(after).toEqual({ categoryId: null, source: 'none', ruleId: null });
        expect(rules.body.rules).toEqual([]);
    });

    it('o categorizador segue regra, dicionário, Pluggy e nenhum, em lote, só com as categorias da company', async () => {
        const account: Account = await harness.signUp('categorizer');
        const groceries: string = await categoryId(account, 'groceries');
        const eatingOut: string = await categoryId(account, 'eating_out');
        const shopping: string = await categoryId(account, 'shopping');
        const created = await createRule(account, { matchType: 'contains', pattern: 'ifood', appliesTo: 'out', categoryId: groceries });
        const categorizer: TransactionCategorizerService = harness.app.get(TransactionCategorizerService, { strict: false });
        const base = { amountMinor: -1000, counterpartyKey: null, providerCategoryId: null };

        const results = await harness.inCompany(account.company.id, async () =>
            categorizer.categorizeMany([
                { ...base, normalizedDescription: 'IFOOD RESTAURANTE SABOR' },
                { ...base, normalizedDescription: 'RAPPI PEDIDO' },
                { ...base, normalizedDescription: 'LOJINHA DO ZE', providerCategoryId: '09010000' },
                { ...base, normalizedDescription: 'MARIA SOUZA', providerCategoryId: '06000000' }
            ])
        );

        expect(results).toEqual([
            { categoryId: groceries, source: 'rule', ruleId: created.body.rule.id },
            { categoryId: eatingOut, source: 'dictionary', ruleId: null },
            { categoryId: shopping, source: 'provider', ruleId: null },
            { categoryId: null, source: 'none', ruleId: null }
        ]);
    });

    it('upsertFromCorrection cria a regra de favorecido e depois troca a categoria sem duplicar', async () => {
        const account: Account = await harness.signUp('correction');
        const groceries: string = await categoryId(account, 'groceries');
        const housing: string = await categoryId(account, 'housing');
        const service: CategoryRuleService = harness.app.get(CategoryRuleService, { strict: false });
        const correction = { matchType: 'counterparty', pattern: 'hmac-of-document', label: 'Maria Souza', appliesTo: 'out' } as const;

        const first = await harness.inCompany(account.company.id, async () =>
            service.upsertFromCorrection({ ...correction, categoryId: groceries })
        );
        const second = await harness.inCompany(account.company.id, async () =>
            service.upsertFromCorrection({ ...correction, categoryId: housing })
        );
        const listed = await harness.call<{ rules: RuleBody[] }>(account.token, 'GET', '/spending/rules');

        expect(second.id).toBe(first.id);
        expect(listed.body.rules).toEqual([
            expect.objectContaining({ id: first.id, matchType: 'counterparty', label: 'Maria Souza', categoryId: housing })
        ]);
        expect(JSON.stringify(listed.body)).not.toContain('hmac-of-document');
    });

    it('isolamento: a company B não lê, edita nem exclui regra da A e não aponta para categoria da A', async () => {
        const accountA: Account = await harness.signUp('iso-a');
        const accountB: Account = await harness.signUp('iso-b');
        const groceriesA: string = await categoryId(accountA, 'groceries');
        const groceriesB: string = await categoryId(accountB, 'groceries');
        const fromA = await createRule(accountA, {
            matchType: 'contains',
            pattern: 'segredo da a',
            appliesTo: 'out',
            categoryId: groceriesA
        });

        const listB = await harness.call<{ rules: RuleBody[] }>(accountB.token, 'GET', '/spending/rules');
        const patch = await harness.call<ProblemBody>(accountB.token, 'PATCH', `/spending/rules/${fromA.body.rule.id}`, {
            categoryId: groceriesB
        });
        const remove = await harness.call<ProblemBody>(accountB.token, 'DELETE', `/spending/rules/${fromA.body.rule.id}`);
        const pointing = await harness.call<ProblemBody>(accountB.token, 'POST', '/spending/rules', {
            matchType: 'contains',
            pattern: 'qualquer',
            appliesTo: 'out',
            categoryId: groceriesA
        });
        const samePattern = await createRule(accountB, {
            matchType: 'contains',
            pattern: 'segredo da a',
            appliesTo: 'out',
            categoryId: groceriesB
        });

        expect(listB.body.rules).toEqual([]);
        expect([patch.status, patch.body.type]).toEqual([404, 'categories.rule_not_found']);
        expect([remove.status, remove.body.type]).toEqual([404, 'categories.rule_not_found']);
        expect([pointing.status, pointing.body.type]).toEqual([404, 'categories.category_not_found']);
        expect(samePattern.status).toBe(201);
        const listA = await harness.call<{ rules: RuleBody[] }>(accountA.token, 'GET', '/spending/rules');
        expect(listA.body.rules.map((rule: RuleBody) => rule.id)).toEqual([fromA.body.rule.id]);
    });
});
