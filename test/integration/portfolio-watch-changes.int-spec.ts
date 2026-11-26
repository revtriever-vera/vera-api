import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PlanContractService } from '../../src/modules/plans/services/plan-contract.service';
import { DateUtil } from '../../src/shared/utils/date.util';
import { asRole } from '../support/as-role';
import { Account, AllocationHarness } from './support/allocation-harness';
import { seedAsset } from './support/portfolio-seed';

interface ChangeBody {
    readonly id: string;
    readonly symbol: string;
    readonly title: string;
    readonly summary: string;
    readonly summaryAvailable: boolean;
    readonly relevance: number | null;
    readonly weightBps: number | null;
    readonly weightLine: string | null;
    readonly documentUrl: string;
    readonly source: string;
}

interface ChangesBody {
    readonly days: number;
    readonly notice: string;
    readonly items: readonly ChangeBody[];
}

interface ProblemBody {
    readonly type: string;
    readonly meta?: { readonly documentCount?: number };
}

interface ClassesBody {
    readonly data: readonly { readonly id: string; readonly systemKey: string | null }[];
}

const NOW: Date = new Date();

function daysAgo(days: number): Date {
    return DateUtil.addDays(NOW, -days);
}

describe('feed "O que mudou" por conta', () => {
    let harness: AllocationHarness;
    let stocks: string;
    let fund: string;
    let outsider: string;
    let docs: Record<string, string>;

    beforeAll(async () => {
        harness = await AllocationHarness.start('portfolio_watch_changes');
        stocks = await seedAsset(harness, seed('CHGA3', 'acoes_br', 'acoes_br'), false);
        fund = await seedAsset(harness, seed('CHGB11', 'fii', 'fii'), false);
        outsider = await seedAsset(harness, seed('CHGZ3', 'acoes_br', 'acoes_br'), false);
    });

    afterAll(async () => {
        await harness.stop();
    });

    beforeEach(async () => {
        await harness.pg.query('DELETE FROM "MarketDocumentSummaries"');
        await harness.pg.query('DELETE FROM "MarketDocuments"');
        docs = {};
    });

    function seed(symbol: string, classKey: string, typeGroup: string) {
        return { symbol, classKey, market: 'B3', typeGroup, currency: 'BRL', quantity: '1', price: '10', provider: 'brapi' };
    }

    async function document(
        name: string,
        assetIds: string[],
        publishedAt: Date,
        options: { status?: string; skipReason?: string | null; summary?: { relevance: number; discard?: boolean; locale?: string } } = {}
    ): Promise<void> {
        const id: string = crypto.randomUUID();
        docs[name] = id;
        await harness.pg.query(
            `INSERT INTO "MarketDocuments" (id, source, "externalId", category, title, "publishedAt", url, status, "skipReason", "assetIds")
             VALUES ($1, 'cvm_ipe', $2, 'relevant_fact', $3, $4, $5, $6, $7, $8::uuid[])`,
            [
                id,
                `ext-${name}`,
                `Título ${name}`,
                publishedAt,
                `https://example.com/${name}`,
                options.status ?? 'summarized',
                options.skipReason ?? null,
                assetIds
            ]
        );
        if (options.summary !== undefined) {
            await harness.pg.query(
                `INSERT INTO "MarketDocumentSummaries" (id, "documentId", locale, "promptVersion", summary, kind, relevance, discard)
                 VALUES ($1, $2, $3, 'v1', $4, 'relevant_fact', $5, $6)`,
                [
                    crypto.randomUUID(),
                    id,
                    options.summary.locale ?? 'pt-BR',
                    `Resumo ${name}`,
                    options.summary.relevance,
                    options.summary.discard ?? false
                ]
            );
        }
    }

    async function premiumAccount(label: string): Promise<Account> {
        const account: Account = await harness.signUp(label);
        await harness.inCompany(account.company.id, async () =>
            harness.app.get(PlanContractService, { strict: false }).open('premium', {
                startsAt: new Date('2026-11-01T00:00:00Z'),
                subscriptionId: crypto.randomUUID()
            })
        );
        return account;
    }

    async function hold(account: Account, assetId: string, quantity: string, holderUserId?: string | null): Promise<void> {
        const response = await harness.call(account.token, 'POST', '/positions', { assetId, quantity, holderUserId });
        expect(response.status).toBe(201);
    }

    async function changes(account: Account, query: string = ''): Promise<{ status: number; body: ChangesBody }> {
        return harness.call<ChangesBody>(account.token, 'GET', `/portfolio-watch/changes${query}`);
    }

    function idsOf(body: ChangesBody): string[] {
        return body.items.map((item: ChangeBody): string => item.id);
    }

    it('conta Free recebe plan.feature_locked com a contagem e nenhum conteúdo, e não consome o modelo', async () => {
        const free: Account = await harness.signUp('changes-free');
        await hold(free, stocks, '10');
        await document('d1', [stocks], daysAgo(1), { summary: { relevance: 2 } });
        await document('d2', [stocks], daysAgo(2));
        await document('d3', [outsider], daysAgo(2), { summary: { relevance: 3 } });

        const response = await harness.call<ProblemBody>(free.token, 'GET', '/portfolio-watch/changes');

        expect(response.status).toBe(402);
        expect(response.body.type).toBe('plan.feature_locked');
        expect(response.body.meta?.documentCount).toBe(2);
        expect(JSON.stringify(response.body)).not.toContain('Resumo');
        const calls = await harness.pg.query('SELECT count(*)::int AS total FROM "LlmCalls"');
        expect(calls.rows[0]).toEqual({ total: 0 });
    });

    it('ordena por relevância x peso e depois pela data, com a linha de peso, o aviso e a fonte', async () => {
        const premium: Account = await premiumAccount('changes-order');
        await hold(premium, stocks, '80');
        await hold(premium, fund, '20');
        await document('low-heavy', [stocks], daysAgo(3), { summary: { relevance: 1 } });
        await document('high-light', [fund], daysAgo(1), { summary: { relevance: 3 } });
        await document('mid-heavy-new', [stocks], daysAgo(1), { summary: { relevance: 1 } });

        const response = await changes(premium);

        expect(response.status).toBe(200);
        expect(response.body.days).toBe(7);
        expect(response.body.notice).toBe('Isto não é uma recomendação de compra ou venda.');
        expect(idsOf(response.body)).toEqual([docs['mid-heavy-new'], docs['low-heavy'], docs['high-light']]);
        expect(response.body.items[0]).toMatchObject({
            symbol: 'CHGA3',
            summary: 'Resumo mid-heavy-new',
            summaryAvailable: true,
            relevance: 1,
            weightBps: 8000,
            weightLine: 'CHGA3 é 80% da sua carteira.',
            documentUrl: 'https://example.com/mid-heavy-new',
            source: 'cvm_ipe'
        });
        expect(response.body.items[2]).toMatchObject({ symbol: 'CHGB11', weightBps: 2000, weightLine: 'CHGB11 é 20% da sua carteira.' });
    });

    it('descartado, rotina, pendente, fora da janela e ativo de fora não entram; sem resumo mostra título e link', async () => {
        const premium: Account = await premiumAccount('changes-filter');
        await hold(premium, stocks, '10');
        await document('kept', [stocks], daysAgo(2), { summary: { relevance: 2 } });
        await document('discarded', [stocks], daysAgo(2), { summary: { relevance: 2, discard: true } });
        await document('routine', [stocks], daysAgo(2), { status: 'skipped', skipReason: 'routine_category' });
        await document('pending', [stocks], daysAgo(2), { status: 'pending' });
        await document('old', [stocks], daysAgo(20), { summary: { relevance: 3 } });
        await document('foreign', [outsider], daysAgo(2), { summary: { relevance: 3 } });
        await document('capped', [stocks], daysAgo(3), { status: 'extracted' });
        await document('package', [stocks], daysAgo(4), { status: 'skipped', skipReason: 'financial_package' });

        const week = await changes(premium, '?days=7');
        const month = await changes(premium, '?days=30');

        expect(idsOf(week.body)).toEqual([docs['kept'], docs['capped'], docs['package']]);
        expect(week.body.items[1]).toMatchObject({
            title: 'Título capped',
            summary: 'Resumo indisponível',
            summaryAvailable: false,
            relevance: null,
            documentUrl: 'https://example.com/capped'
        });
        expect(idsOf(month.body)).toContain(docs['old']);
        expect(month.body.days).toBe(30);
    });

    it('holder filtra pela pessoa, classId pela classe, e o leitor também vê', async () => {
        const premium: Account = await premiumAccount('changes-holder');
        const ana: Account = await asRole(harness, premium, 'editor');
        const viewer: Account = await asRole(harness, premium, 'viewer');
        await hold(premium, stocks, '10', ana.user.id);
        await hold(premium, fund, '10', null);
        await document('stock-doc', [stocks], daysAgo(1), { summary: { relevance: 2 } });
        await document('fund-doc', [fund], daysAgo(1), { summary: { relevance: 2 } });
        const classes = await harness.call<ClassesBody>(premium.token, 'GET', '/allocation/classes');
        const fundClass: string = classes.body.data.find((item) => item.systemKey === 'fii')?.id ?? '';

        const forAna = await changes(viewer, `?holder=${ana.user.id}`);
        const forAll = await changes(premium, '?holder=all');
        const byClass = await changes(premium, `?classId=${fundClass}`);
        const everything = await changes(premium);

        expect(idsOf(forAna.body)).toEqual([docs['stock-doc']]);
        expect(idsOf(forAll.body)).toEqual([docs['fund-doc']]);
        expect(idsOf(byClass.body)).toEqual([docs['fund-doc']]);
        expect(everything.body.items).toHaveLength(2);
    });

    it('duas contas veem só os documentos dos próprios ativos e nada de conta é gravado nas tabelas globais', async () => {
        const first: Account = await premiumAccount('changes-iso-a');
        const second: Account = await premiumAccount('changes-iso-b');
        await hold(first, stocks, '10');
        await hold(second, fund, '10');
        await document('only-first', [stocks], daysAgo(1), { summary: { relevance: 2 } });
        await document('only-second', [fund], daysAgo(1), { summary: { relevance: 2 } });
        const before = await harness.pg.query('SELECT count(*)::int AS total FROM "MarketDocumentSummaries"');

        const seenByFirst = await changes(first);
        const seenBySecond = await changes(second);

        expect(idsOf(seenByFirst.body)).toEqual([docs['only-first']]);
        expect(idsOf(seenBySecond.body)).toEqual([docs['only-second']]);
        const after = await harness.pg.query('SELECT count(*)::int AS total FROM "MarketDocumentSummaries"');
        expect(after.rows).toEqual(before.rows);
        const accountColumns = await harness.pg.query(
            `SELECT table_name FROM information_schema.columns
             WHERE table_name IN ('MarketDocuments', 'MarketDocumentSummaries') AND column_name = 'companyId'`
        );
        expect(accountColumns.rows).toEqual([]);
        const calls = await harness.pg.query('SELECT count(*)::int AS total FROM "LlmCalls"');
        expect(calls.rows[0]).toEqual({ total: 0 });
    });

    it('recusa janela fora de 7 ou 30 e exige login', async () => {
        const premium: Account = await premiumAccount('changes-invalid');

        expect((await changes(premium, '?days=15')).status).toBe(400);
        expect((await harness.call(null, 'GET', '/portfolio-watch/changes')).status).toBe(401);
    });
});
