import { afterAll, beforeAll, beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';
import { EnqueueMailRequest } from '../../src/core/mail/mailer.port';
import { MockLlmDriver } from '../../src/core/llm/drivers/mock-llm.driver';
import { PlanContractService } from '../../src/modules/plans/services/plan-contract.service';
import { monthlyReviewContextSchema } from '../../src/modules/ai-assistant/validation/ai-payload.schemas';
import { IndexSyncApplication } from '../../src/modules/fixed-income/application/index-sync.application';
import { addDays } from '../../src/modules/fixed-income/domain/curve/business-days';
import { PortfolioMonthlyReviewApplication } from '../../src/modules/portfolio-watch/application/portfolio-monthly-review.application';
import { MonthlyReview, MonthlyReviewList } from '../../src/modules/portfolio-watch/validation/monthly-review.schemas';
import { DateUtil } from '../../src/shared/utils/date.util';
import { Account, AllocationHarness } from './support/allocation-harness';
import { seedPrototypeAssets } from './support/portfolio-seed';
import { CapturingPublisher, PublishedMessage } from './support/queue';

process.env['FIXED_INCOME_INDEX_DRIVER'] = 'mock';
process.env['LLM_REPEAT_LIMIT'] = '1000';

const TODAY: string = DateUtil.todayInBrazil();
const MONTH: string = '2026-10';
const NEXT: string = '2026-11';
const EQUITY: string = '0199b5b8-1c2d-7000-8000-0000000000a1';
const REVIEW_COMPANY_TYPE: string = 'portfolio-watch.monthly-review.company.requested';
const MAIL_MESSAGE: string = 'email.send.requested';
const REVIEW_TEMPLATE: string = 'portfolio-monthly-review';
const GOOD_PARAGRAPHS: string = JSON.stringify({
    paragraphs: ['A carteira rendeu **+10,46%** em outubro.', '[[ativo:custom_1]] subiu +10,00% no preço.']
});
const INVENTED_PARAGRAPHS: string = JSON.stringify({ paragraphs: ['A carteira rendeu **+55,00%** em outubro.'] });

interface Photo {
    readonly month: string;
    readonly assetId: string;
    readonly quantity: string;
    readonly price: string;
    readonly valueMinor: number;
}

interface Operation {
    readonly kind: string;
    readonly tradeDate: string;
    readonly quantity: string;
    readonly grossMinor: number;
}

describe('revisão mensal da carteira', () => {
    let harness: AllocationHarness;
    let publisher: CapturingPublisher;
    let assetIds: Record<string, string>;
    let calls: MockInstance<MockLlmDriver['generate']>;
    let mock: MockLlmDriver;

    beforeAll(async () => {
        publisher = new CapturingPublisher();
        harness = await AllocationHarness.start('portfolio_review', publisher);
        const sync: IndexSyncApplication = harness.app.get(IndexSyncApplication, { strict: false });
        const from: string = addDays(TODAY, -800);
        await sync.syncWindow({ series: 'cdi_daily', from, to: TODAY });
        await sync.syncWindow({ series: 'ipca_monthly', from, to: TODAY });
        assetIds = await seedPrototypeAssets(harness);
        mock = harness.app.get(MockLlmDriver, { strict: false });
        calls = vi.spyOn(mock, 'generate');
    });

    afterAll(async () => {
        delete process.env['LLM_REPEAT_LIMIT'];
        await harness.stop();
    });

    beforeEach(() => {
        publisher.published.length = 0;
        calls.mockClear();
    });

    async function photo(account: Account, item: Photo): Promise<void> {
        await harness.pg.query(
            `INSERT INTO "PortfolioMonthlySnapshots" ("id","companyId","month","assetId","holdingKind","classId","quantity","price","valueMinor","currency") VALUES ($1,$2,$3,$4,'position',$5,$6,$7,$8,'BRL')`,
            [crypto.randomUUID(), account.company.id, item.month, item.assetId, EQUITY, item.quantity, item.price, item.valueMinor]
        );
    }

    async function operations(account: Account, items: readonly Operation[]): Promise<void> {
        const importId: string = crypto.randomUUID();
        await harness.pg.query(
            `INSERT INTO "InvestmentImports" ("id","companyId","source","fileSha256","fileName") VALUES ($1,$2,'model',$3,'ops.csv')`,
            [importId, account.company.id, importId]
        );
        for (const item of items) {
            await harness.pg.query(
                `INSERT INTO "InvestmentOperations" ("id","companyId","importId","assetId","kind","tradeDate","quantity","unitPrice","grossMinor","currency","appliedToPosition","fingerprint") VALUES ($1,$2,$3,$4,$5,$6,$7,1,$8,'BRL',$9,$10)`,
                [
                    crypto.randomUUID(),
                    account.company.id,
                    importId,
                    assetIds['ITUB4'],
                    item.kind,
                    item.tradeDate,
                    item.quantity,
                    item.grossMinor,
                    item.kind !== 'income',
                    `${importId}-${item.tradeDate}-${item.kind}`
                ]
            );
        }
    }

    async function review(account: Account, month: string = MONTH): Promise<boolean> {
        const application: PortfolioMonthlyReviewApplication = harness.app.get(PortfolioMonthlyReviewApplication, { strict: false });
        return harness.inCompany(account.company.id, async () => application.reviewCompany(account.company.id, month));
    }

    async function fetched(account: Account, month: string = MONTH): Promise<MonthlyReview> {
        const response = await harness.call<MonthlyReview>(account.token, 'GET', `/portfolio-watch/monthly-reviews/${month}`);
        expect(response.status).toBe(200);
        return response.body;
    }

    async function withPhotos(name: string, start: Photo | null, end: Photo): Promise<Account> {
        const account: Account = await harness.signUp(name);
        if (start !== null) {
            await photo(account, start);
        }
        await photo(account, end);
        return account;
    }

    function itub(month: string, quantity: string, price: string, valueMinor: number): Photo {
        return { month, assetId: assetIds['ITUB4'] as string, quantity, price, valueMinor };
    }

    it('conta com aporte e provento no histórico: rentabilidade ponderada, altas, proventos e indicadores, no plano grátis', async () => {
        const account: Account = await withPhotos('rev-a', itub(MONTH, '100', '30', 300_000), itub(NEXT, '150', '33', 495_000));
        await operations(account, [
            { kind: 'buy', tradeDate: '2026-10-16', quantity: '50', grossMinor: 160_000 },
            { kind: 'income', tradeDate: '2026-10-20', quantity: '100', grossMinor: 5000 }
        ]);

        expect(await review(account)).toBe(true);
        const body: MonthlyReview = await fetched(account);

        expect(body.month).toBe(MONTH);
        expect(body.returnPct).toBeCloseTo(10.46, 2);
        expect(body.byClass).toEqual([{ classId: EQUITY, startMinor: 300_000, endMinor: 495_000, returnPct: 10.46 }]);
        expect(body.income).toEqual({ amountMinor: 5000, source: 'operations' });
        expect(body.topGainers).toEqual([{ assetId: assetIds['ITUB4'], symbol: 'ITUB4', variationPct: 10 }]);
        expect(body.topLosers).toEqual([]);
        expect(body.coverage).toMatchObject({ reason: null, message: null });
        expect(body.benchmarks.cdi.state).toBe('ok');
        expect(['not_configured', 'no_data']).toContain(body.benchmarks.ibovespa.state);
        expect(body.benchmarks.ibovespa.returnPct).toBeNull();
        expect(body.concentration.fgcExposure.overLimitMinor).toBe(0);
    });

    it('com resgate no meio do mês e provento só no livro da data-com', async () => {
        const account: Account = await withPhotos('rev-b', itub(MONTH, '100', '30', 300_000), itub(NEXT, '60', '35', 210_000));
        await operations(account, [{ kind: 'sell', tradeDate: '2026-10-11', quantity: '40', grossMinor: 140_000 }]);
        await harness.pg.query(
            `INSERT INTO "PortfolioIncomeLedger" ("id","companyId","eventId","assetId","quantityAtExDate","amountMinor","currency","paymentDate") VALUES ($1,$2,$3,$4,'100',7800,'BRL','2026-10-20')`,
            [crypto.randomUUID(), account.company.id, crypto.randomUUID(), assetIds['ITUB4']]
        );

        await review(account);
        const body: MonthlyReview = await fetched(account);

        expect(body.income).toEqual({ amountMinor: 7800, source: 'ledger' });
        expect(body.returnPct).toBeCloseTo(((50_000 + 7800) / (300_000 - (140_000 * 21) / 31)) * 100, 1);
    });

    it('classe que não fecha com o histórico fica sem rentabilidade e sem total', async () => {
        const account: Account = await withPhotos('rev-c', itub(MONTH, '100', '30', 300_000), itub(NEXT, '150', '33', 495_000));
        await operations(account, [{ kind: 'buy', tradeDate: '2026-09-10', quantity: '10', grossMinor: 1000 }]);

        await review(account);
        const body: MonthlyReview = await fetched(account);

        expect(body.returnPct).toBeUndefined();
        expect(body.byClass[0]).toMatchObject({ classId: EQUITY, reason: 'quantity_mismatch' });
        expect(body.coverage.reason).toBe('classes_not_closing');
    });

    it('conta sem nenhuma operação importada recebe os números sem rentabilidade, com a mensagem', async () => {
        const account: Account = await withPhotos('rev-d', itub(MONTH, '100', '30', 300_000), itub(NEXT, '100', '33', 330_000));

        await review(account);
        const body: MonthlyReview = await fetched(account);

        expect(body.returnPct).toBeUndefined();
        expect(body.coverage).toMatchObject({
            reason: 'no_operations',
            message: 'A rentabilidade aparece quando as suas operações estiverem importadas.'
        });
        expect(body.byClass).toEqual([{ classId: EQUITY, startMinor: 300_000, endMinor: 330_000 }]);
    });

    it('primeiro mês, sem foto do início: sem rentabilidade e a mensagem diz a partir de quando', async () => {
        const account: Account = await withPhotos('rev-e', null, itub(NEXT, '100', '33', 330_000));
        await operations(account, [{ kind: 'buy', tradeDate: '2026-09-10', quantity: '100', grossMinor: 1000 }]);

        await review(account);
        const body: MonthlyReview = await fetched(account);

        expect(body.coverage).toMatchObject({
            reason: 'no_previous_snapshot',
            message: 'A rentabilidade aparece a partir de novembro de 2026.'
        });
        expect(body.topGainers).toEqual([]);
    });

    it('sem foto completa no fim do mês não gera revisão, e gerar de novo não duplica nem troca a que já existe', async () => {
        const without: Account = await harness.signUp('rev-f');
        const account: Account = await withPhotos('rev-g', itub(MONTH, '100', '30', 300_000), itub(NEXT, '100', '33', 330_000));

        const skipped: boolean = await review(without);
        const first: boolean = await review(account);
        await harness.pg.query(`UPDATE "PortfolioMonthlySnapshots" SET "valueMinor" = 999999 WHERE "companyId" = $1 AND "month" = $2`, [
            account.company.id,
            NEXT
        ]);
        const second: boolean = await review(account);

        expect([skipped, first, second]).toEqual([false, true, false]);
        const rows = await harness.pg.query<{ total: string }>(`SELECT count(*) AS total FROM "MonthlyReviews" WHERE "companyId" = $1`, [
            account.company.id
        ]);
        expect(Number(rows.rows[0]?.total)).toBe(1);
        expect((await fetched(account)).byClass[0]?.endMinor).toBe(330_000);
    });

    it('cada conta vê só a sua revisão; mês sem revisão dá 404 e mês inválido dá 400', async () => {
        const mine: Account = await withPhotos('rev-h', itub(MONTH, '100', '30', 300_000), itub(NEXT, '100', '33', 330_000));
        const other: Account = await harness.signUp('rev-i');
        await review(mine);

        expect((await harness.call(other.token, 'GET', `/portfolio-watch/monthly-reviews/${MONTH}`)).status).toBe(404);
        expect((await harness.call(mine.token, 'GET', '/portfolio-watch/monthly-reviews/2026-09')).status).toBe(404);
        expect((await harness.call(mine.token, 'GET', '/portfolio-watch/monthly-reviews/2026-13')).status).toBe(400);
        const list = await harness.call<MonthlyReviewList>(mine.token, 'GET', '/portfolio-watch/monthly-reviews');
        expect(list.body.items).toEqual([{ month: MONTH, returnPct: null }]);
        expect((await harness.call<MonthlyReviewList>(other.token, 'GET', '/portfolio-watch/monthly-reviews')).body.items).toEqual([]);
    });

    it('a varredura do dia 1 pede a revisão do mês que fechou, uma por conta com carteira', async () => {
        const holder: Account = await harness.signUp('rev-j');
        const nobody: Account = await harness.signUp('rev-k');
        const created = await harness.call(holder.token, 'POST', '/positions', { assetId: assetIds['ITUB4'], quantity: '10' });
        expect(created.status).toBe(201);
        const application: PortfolioMonthlyReviewApplication = harness.app.get(PortfolioMonthlyReviewApplication, { strict: false });

        await application.fanOutMonthly(new Date('2026-11-01T08:00:00Z'));

        const asked: string[] = publisher.ofType(REVIEW_COMPANY_TYPE).map((message) => message.options?.jobId ?? '');
        expect(asked).toContain(`portfolio-watch-review-${holder.company.id}-2026-10`);
        expect(asked.some((jobId: string) => jobId.includes(nobody.company.id))).toBe(false);
    });
    async function premium(account: Account, consent: boolean): Promise<void> {
        await harness.inCompany(account.company.id, async () =>
            harness.app.get(PlanContractService, { strict: false }).open('premium', {
                startsAt: new Date('2026-11-01T00:00:00Z'),
                subscriptionId: crypto.randomUUID()
            })
        );
        if (consent) {
            expect(
                (await harness.call(account.token, 'PUT', '/ai/consent', { noticeVersion: 1, source: 'summary_card' })).status
            ).toBeLessThan(300);
        }
    }

    async function ready(name: string): Promise<Account> {
        const account: Account = await withPhotos(name, itub(MONTH, '100', '30', 300_000), itub(NEXT, '150', '33', 495_000));
        await operations(account, [
            { kind: 'buy', tradeDate: '2026-10-16', quantity: '50', grossMinor: 160_000 },
            { kind: 'income', tradeDate: '2026-10-20', quantity: '100', grossMinor: 5000 }
        ]);
        return account;
    }

    function reviewMails(): EnqueueMailRequest[] {
        return publisher
            .ofType(MAIL_MESSAGE)
            .map((message: PublishedMessage): EnqueueMailRequest => message.payload as EnqueueMailRequest)
            .filter((request: EnqueueMailRequest): boolean => request.template === REVIEW_TEMPLATE);
    }

    async function stored(account: Account): Promise<number> {
        const rows = await harness.pg.query<{ total: number }>(
            `SELECT count(*)::int AS total FROM "AiSummaries" WHERE "companyId" = $1 AND "kind" = 'monthly_review'`,
            [account.company.id]
        );
        return rows.rows[0]?.total ?? 0;
    }

    async function summaryOf(account: Account): Promise<string | null> {
        return (await harness.call<{ summary: string | null }>(account.token, 'GET', `/portfolio-watch/monthly-reviews/${MONTH}`)).body
            .summary;
    }

    it('Free: os números ficam, sem chamada ao modelo, sem e-mail e sem parágrafo', async () => {
        const account: Account = await ready('rev-free');

        await review(account);

        expect(calls).not.toHaveBeenCalled();
        expect(reviewMails()).toHaveLength(0);
        expect(await stored(account)).toBe(0);
        expect((await fetched(account)).returnPct).toBeCloseTo(10.46, 2);
        expect(await summaryOf(account)).toBeNull();
        expect((await harness.call(account.token, 'GET', `/ai/payload?kind=monthly_review&month=${MONTH}`)).status).toBe(402);
    });

    it('Premium sem a permissão de envio: e-mail só com os números e nenhuma chamada ao modelo', async () => {
        const account: Account = await ready('rev-noconsent');
        await premium(account, false);

        await review(account);

        expect(calls).not.toHaveBeenCalled();
        expect(reviewMails()).toHaveLength(1);
        expect(reviewMails()[0]?.props['paragraphs']).toBeUndefined();
        expect(reviewMails()[0]?.props['returnPct']).toBe('10.46');
        expect(await stored(account)).toBe(0);
        expect(await summaryOf(account)).toBeNull();
    });

    it('Premium com permissão: escreve o parágrafo, guarda, manda no e-mail, mostra na tela e não reenvia nem chama de novo no mês repetido', async () => {
        const account: Account = await ready('rev-premium');
        await premium(account, true);
        mock.enqueue(GOOD_PARAGRAPHS);

        await review(account);
        await harness.pg.query(`DELETE FROM "MonthlyReviews" WHERE "companyId" = $1`, [account.company.id]);
        await review(account);

        expect(calls).toHaveBeenCalledTimes(1);
        expect(await stored(account)).toBe(1);
        const sent: EnqueueMailRequest[] = reviewMails();
        expect(sent).toHaveLength(1);
        expect(sent[0]?.to.email).toBe(account.user.email);
        expect(sent[0]?.unsubscribeUrl).toContain('/notifications/unsubscribe/');
        expect(JSON.parse(sent[0]?.props['paragraphs'] ?? '[]')).toEqual([
            'A carteira rendeu **+10,46%** em outubro.',
            'ITUB4 subiu +10,00% no preço.'
        ]);
        expect(await summaryOf(account)).toBe('A carteira rendeu **+10,46%** em outubro.\n\nITUB4 subiu +10,00% no preço.');
    });

    it('o que é enviado ao modelo aparece só com percentuais e chaves, sem o ticker, e vale o esquema documentado', async () => {
        const account: Account = await ready('rev-payload');
        await premium(account, false);
        await review(account);

        const response = await harness.call<{ payload: Record<string, unknown> }>(
            account.token,
            'GET',
            `/ai/payload?kind=monthly_review&month=${MONTH}`
        );

        expect(response.status).toBe(200);
        expect(monthlyReviewContextSchema.safeParse(response.body.payload).success).toBe(true);
        expect(JSON.stringify(response.body)).not.toContain('ITUB4');
        expect(response.body.payload).toMatchObject({
            mes: MONTH,
            rentabilidade_pct: '+10,46%',
            maiores_altas: [{ chave: 'custom_1', variacao_pct: '+10,00%' }]
        });
        expect(calls).not.toHaveBeenCalled();
    });

    it('número inventado pelo modelo é reprovado pelo guard: sem parágrafo, e-mail só com os números', async () => {
        const account: Account = await ready('rev-invented');
        await premium(account, true);
        mock.enqueue(INVENTED_PARAGRAPHS);
        mock.enqueue(INVENTED_PARAGRAPHS);

        await review(account);

        expect(calls).toHaveBeenCalledTimes(2);
        expect(await stored(account)).toBe(0);
        expect(reviewMails()).toHaveLength(1);
        expect(reviewMails()[0]?.props['paragraphs']).toBeUndefined();
    });

    it('quem desligou o aviso do Raio-X não recebe o e-mail', async () => {
        const account: Account = await ready('rev-muted');
        await premium(account, false);
        const off = await harness.call(account.token, 'PATCH', '/notifications/preferences', {
            type: 'portfolio_monthly_review',
            enabled: false
        });
        expect(off.status).toBe(200);

        await review(account);

        expect(reviewMails()).toHaveLength(0);
    });

    it('duas contas Premium: cada uma recebe o seu parágrafo e só vê o seu', async () => {
        const first: Account = await ready('rev-two-a');
        const second: Account = await ready('rev-two-b');
        const outsider: Account = await harness.signUp('rev-two-c');
        await premium(first, true);
        await premium(second, true);
        await premium(outsider, true);
        mock.enqueue(GOOD_PARAGRAPHS);
        mock.enqueue(GOOD_PARAGRAPHS);

        await review(first);
        await review(second);

        expect(await stored(first)).toBe(1);
        expect(await stored(second)).toBe(1);
        expect(
            reviewMails()
                .map((request: EnqueueMailRequest): string => request.to.email)
                .sort()
        ).toEqual([first.user.email, second.user.email].sort());
        expect((await harness.call(outsider.token, 'GET', `/portfolio-watch/monthly-reviews/${MONTH}`)).status).toBe(404);
        expect((await harness.call(outsider.token, 'GET', `/ai/payload?kind=monthly_review&month=${MONTH}`)).status).toBe(204);
    });
});
