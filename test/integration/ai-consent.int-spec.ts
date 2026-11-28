import { Injectable, Module } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { LlmAvailabilityService } from '../../src/core/llm/services/llm-availability.service';
import { IncomingTransaction } from '../../src/modules/transactions/domain/transactions.types';
import { FinancialAccountService } from '../../src/modules/transactions/services/financial-account.service';
import { SpendingDataset, SpendingDatasetService } from '../../src/modules/transactions/services/spending-dataset.service';
import { TransactionIngestionService } from '../../src/modules/transactions/services/transaction-ingestion.service';
import { AiDataPurgePort } from '../../src/modules/ai-assistant/services/ai-data-purge.port';
import { PlanContractService } from '../../src/modules/plans/services/plan-contract.service';
import { DateUtil } from '../../src/shared/utils/date.util';
import { asRole } from '../support/as-role';
import { Account, AllocationHarness } from './support/allocation-harness';
import { CapturingPublisher } from './support/queue';

const purged: { calls: number } = { calls: 0 };

@Injectable()
class FakePurge extends AiDataPurgePort {
    public readonly area: string = 'fake_summaries';

    public async purge(): Promise<number> {
        purged.calls += 1;
        return Promise.resolve(2);
    }
}

@Module({ providers: [FakePurge] })
class FakePurgeModule {}

interface ConsentBody {
    readonly available: boolean;
    readonly granted: boolean;
    readonly needsConsent: boolean;
    readonly noticeVersion: number;
    readonly acceptedNoticeVersion: number | null;
    readonly grantedAt: string | null;
    readonly source: string | null;
    readonly canChange: boolean;
}

interface ProblemBody {
    readonly type: string;
}

interface PayloadBody {
    readonly kind: string;
    readonly noticeVersion: number;
    readonly payload: {
        readonly renda: string;
        readonly gastos_por_categoria: { readonly chave: string; readonly rotulo_padrao?: string }[];
    };
}

const CUSTOM_NAME: string = 'Pix Maria 11987654321';

describe('ai consent and payload', () => {
    let harness: AllocationHarness;
    let dataset: SpendingDataset;

    beforeAll(async () => {
        harness = await AllocationHarness.start('ai_consent', new CapturingPublisher(), [FakePurgeModule]);
        dataset = new SpendingDatasetService().build(DateUtil.localDateIn(DateUtil.BRAZIL_TIMEZONE));
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function premium(account: Account): Promise<Account> {
        const contracts: PlanContractService = harness.app.get(PlanContractService, { strict: false });
        await harness.inCompany(account.company.id, async () => {
            await contracts.open('premium', { startsAt: new Date(), subscriptionId: crypto.randomUUID() });
        });
        return account;
    }

    async function consent(account: Account): Promise<ConsentBody> {
        return (await harness.call<ConsentBody>(account.token, 'GET', '/ai/consent')).body;
    }

    async function loadSpending(owner: Account): Promise<void> {
        const accounts: FinancialAccountService = harness.app.get(FinancialAccountService, { strict: false });
        const ingestion: TransactionIngestionService = harness.app.get(TransactionIngestionService, { strict: false });
        for (const spec of dataset.accounts) {
            const created = await harness.inCompany(owner.company.id, async () =>
                accounts.upsertProviderAccount({
                    provider: 'pluggy',
                    externalId: `acc-${spec.key}`,
                    kind: spec.kind,
                    name: spec.name,
                    institutionName: spec.institutionName,
                    numberLast4: spec.numberLast4,
                    currency: spec.currency
                })
            );
            const items: IncomingTransaction[] = dataset.transactions
                .filter((transaction) => transaction.accountKey === spec.key)
                .map((transaction) => ({
                    externalId: `pluggy:${transaction.key}`,
                    date: transaction.date,
                    amountMinor: transaction.amountMinor,
                    currency: 'BRL',
                    description: transaction.description,
                    counterpartyName: transaction.counterpartyName,
                    counterpartyDocument: transaction.counterpartyDocument,
                    providerCategoryId: transaction.providerCategoryId
                }));
            await harness.inCompany(owner.company.id, async () =>
                ingestion.ingest({ accountId: created.id, source: 'pluggy', importId: null, items })
            );
        }
    }

    it('sem linha: não permitido, precisa pedir; o Free também tem a IA disponível', async () => {
        const free: Account = await harness.signUp('ai-free');
        const paid: Account = await premium(await harness.signUp('ai-paid'));

        expect(await consent(free)).toEqual({
            available: true,
            granted: false,
            needsConsent: true,
            noticeVersion: 1,
            acceptedNoticeVersion: null,
            grantedAt: null,
            source: null,
            canChange: true
        });
        expect(await consent(paid)).toMatchObject({ available: true, granted: false, needsConsent: true });
    });

    it('PUT com a versão atual concede, com versão antiga responde 409, no Free também concede e sem credencial 503', async () => {
        const free: Account = await harness.signUp('ai-put-free');
        const paid: Account = await premium(await harness.signUp('ai-put-paid'));
        const body = { noticeVersion: 1, source: 'summary_card' };

        const outdated = await harness.call<ProblemBody>(paid.token, 'PUT', '/ai/consent', { ...body, noticeVersion: 2 });
        const invalid = await harness.call<ProblemBody>(paid.token, 'PUT', '/ai/consent', { ...body, source: 'whatsapp_link' });
        const freeGranted = await harness.call<ConsentBody>(free.token, 'PUT', '/ai/consent', body);
        const spy = vi.spyOn(harness.app.get(LlmAvailabilityService, { strict: false }), 'enabled').mockResolvedValue(false);
        const noKey = await harness.call<ProblemBody>(paid.token, 'PUT', '/ai/consent', body);
        spy.mockRestore();
        const granted = await harness.call<ConsentBody>(paid.token, 'PUT', '/ai/consent', body);

        expect(outdated).toMatchObject({ status: 409, body: { type: 'ai.notice_outdated' } });
        expect(invalid.status).toBe(400);
        expect(freeGranted).toMatchObject({ status: 200, body: { granted: true, needsConsent: false } });
        expect(noKey).toMatchObject({ status: 503, body: { type: 'billing.feature_disabled' } });
        expect(granted.status).toBe(200);
        expect(granted.body).toMatchObject({ granted: true, needsConsent: false, acceptedNoticeVersion: 1, source: 'summary_card' });
        expect(await consent(paid)).toMatchObject({ granted: true, grantedAt: granted.body.grantedAt });
    });

    it('DELETE desliga, chama as portas registradas, é idempotente e aceitar de novo volta a conceder', async () => {
        const owner: Account = await premium(await harness.signUp('ai-delete'));
        await harness.call(owner.token, 'PUT', '/ai/consent', { noticeVersion: 1, source: 'privacy_settings' });
        const before: number = purged.calls;

        const first = await harness.call(owner.token, 'DELETE', '/ai/consent');
        const second = await harness.call(owner.token, 'DELETE', '/ai/consent');
        const off: ConsentBody = await consent(owner);

        expect([first.status, second.status]).toEqual([204, 204]);
        expect(purged.calls - before).toBe(2);
        expect(off).toMatchObject({ granted: false, needsConsent: true, acceptedNoticeVersion: 1 });
        const rows = await harness.pg.query<{ revokedAt: Date | null; revokedByUserId: string }>(
            'SELECT "revokedAt", "revokedByUserId" FROM "AiConsents" WHERE "companyId" = $1',
            [owner.company.id]
        );
        expect(rows.rows).toHaveLength(1);
        expect(rows.rows[0]).toMatchObject({ revokedByUserId: owner.user.id });
        expect(rows.rows[0]?.revokedAt).not.toBeNull();

        await harness.call(owner.token, 'PUT', '/ai/consent', { noticeVersion: 1, source: 'summary_card' });
        const again = await consent(owner);
        const count = await harness.pg.query('SELECT count(*)::int AS total FROM "AiConsents" WHERE "companyId" = $1', [owner.company.id]);
        expect(again).toMatchObject({ granted: true, source: 'summary_card' });
        expect(count.rows[0]).toEqual({ total: 1 });
    });

    it('Leitura não muda a permissão: 403 em PUT e DELETE e canChange false; Editor muda', async () => {
        const owner: Account = await premium(await harness.signUp('ai-roles'));
        const viewer: Account = await asRole(harness, owner, 'viewer');
        const editor: Account = await asRole(harness, owner, 'editor');

        const put = await harness.call<ProblemBody>(viewer.token, 'PUT', '/ai/consent', { noticeVersion: 1, source: 'summary_card' });
        const del = await harness.call<ProblemBody>(viewer.token, 'DELETE', '/ai/consent');
        const byEditor = await harness.call<ConsentBody>(editor.token, 'PUT', '/ai/consent', { noticeVersion: 1, source: 'summary_card' });

        expect([put.status, del.status]).toEqual([403, 403]);
        expect((await consent(viewer)).canChange).toBe(false);
        expect(byEditor.body).toMatchObject({ granted: true, canChange: true });
        expect(await consent(viewer)).toMatchObject({ granted: true, canChange: false });
    });

    it('duas companies: a permissão de A não libera B', async () => {
        const first: Account = await premium(await harness.signUp('ai-iso-a'));
        const second: Account = await premium(await harness.signUp('ai-iso-b'));

        await harness.call(first.token, 'PUT', '/ai/consent', { noticeVersion: 1, source: 'summary_card' });

        expect((await consent(first)).granted).toBe(true);
        expect(await consent(second)).toMatchObject({ granted: false, needsConsent: true });
    });

    it('GET /ai/payload responde no Free, não exige a permissão, devolve 204 sem dados e nunca traz nomes nem dados de outra company', async () => {
        const free: Account = await harness.signUp('ai-payload-free');
        const owner: Account = await premium(await harness.signUp('ai-payload-a'));
        const other: Account = await premium(await harness.signUp('ai-payload-b'));
        await loadSpending(owner);
        const created = await harness.call<{ id: string }>(owner.token, 'POST', '/spending/categories', {
            name: CUSTOM_NAME,
            kind: 'expense',
            flexibility: 'flexible',
            icon: 'PawPrint'
        });
        const gym = await harness.pg.query<{ id: string }>(
            `SELECT "id" FROM "Transactions" WHERE "companyId" = $1 AND "description" = 'SMART FIT' AND "date" >= $2 LIMIT 1`,
            [owner.company.id, `${dataset.closedMonth}-01`]
        );
        await harness.call(owner.token, 'PATCH', `/spending/transactions/${gym.rows[0]?.id as string}`, { categoryId: created.body.id });
        const query: string = `/ai/payload?kind=month&month=${dataset.closedMonth}`;

        const freeEmpty = await harness.call(free.token, 'GET', query);
        const empty = await harness.call(other.token, 'GET', query);
        const response = await harness.call<PayloadBody>(owner.token, 'GET', query);

        expect(freeEmpty.status).toBe(204);
        expect(empty.status).toBe(204);
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ kind: 'month', noticeVersion: 1, payload: { renda: 'R$ 28.000' } });
        const text: string = JSON.stringify(response.body);
        const forbidden: string[] = [
            CUSTOM_NAME,
            owner.company.id,
            owner.user.id,
            created.body.id,
            ...dataset.transactions.flatMap((item) => [item.description, item.counterpartyName ?? '']),
            ...dataset.accounts.flatMap((item) => [item.name, item.institutionName])
        ].filter((value: string): boolean => value.length > 0);
        forbidden.forEach((value: string): void => {
            expect(text).not.toContain(value);
        });
        expect(response.body.payload.gastos_por_categoria.map((entry) => entry.chave)).toContain('custom_1');
        expect(response.body.payload.gastos_por_categoria.find((entry) => entry.chave === 'custom_1')).not.toHaveProperty('rotulo_padrao');
    });

    it('GET /ai/payload de cortes devolve 204 sem dados e a mesma lista branca com dados', async () => {
        const owner: Account = await premium(await harness.signUp('ai-cuts'));
        const empty = await harness.call(owner.token, 'GET', `/ai/payload?kind=cuts&month=${dataset.closedMonth}`);
        await loadSpending(owner);

        const response = await harness.call<{ payload: { status: string; categorias_flexiveis: unknown[] } }>(
            owner.token,
            'GET',
            `/ai/payload?kind=cuts&month=${dataset.closedMonth}&goalBps=3000`
        );
        const portfolio = await harness.call(owner.token, 'GET', '/ai/payload?kind=portfolio&contributionMinor=100000');

        expect(empty.status).toBe(204);
        expect(response.status).toBe(200);
        expect(response.body.payload.status).toBe('possivel');
        expect(response.body.payload.categorias_flexiveis.length).toBeGreaterThan(0);
        expect(portfolio.status).toBe(204);
    });

    it('exportação inclui data, versão e origem e a exclusão da conta apaga a permissão', async () => {
        const owner: Account = await premium(await harness.signUp('ai-account'));
        await harness.call(owner.token, 'PUT', '/ai/consent', { noticeVersion: 1, source: 'privacy_settings' });

        const exported = await harness.call<{ sections: Record<string, unknown> }>(owner.token, 'GET', '/account/export');
        const removed = await harness.call(owner.token, 'DELETE', '/account', { confirmEmail: owner.user.email });
        const left = await harness.pg.query('SELECT count(*)::int AS total FROM "AiConsents" WHERE "companyId" = $1', [owner.company.id]);

        expect(exported.status).toBe(200);
        expect(exported.body.sections['ai_consent']).toMatchObject({ noticeVersion: 1, source: 'privacy_settings', revokedAt: null });
        expect(removed.status).toBe(204);
        expect(left.rows[0]).toEqual({ total: 0 });
    });
});
