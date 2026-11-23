import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BillingEventsApplication } from '../../src/modules/billing/application/billing-events.application';
import { SubscriptionApplication } from '../../src/modules/billing/application/subscription.application';
import { FakeBillingEngineDriver } from '../../src/modules/billing/drivers/fake-billing-engine.driver';
import { signatureOf } from '../../src/modules/billing/drivers/fake-event-delivery.service';
import { BillingEnginePort } from '../../src/modules/billing/ports/billing-engine.port';
import { BillingAccountEraser } from '../../src/modules/billing/services/billing-account.eraser';
import { AppContext } from '../../src/core/context/app-context.port';
import { MESSAGE_TYPES } from '../../src/shared/constants/queues.constants';
import { Account, AllocationHarness, ApiResponse } from './support/allocation-harness';
import { CapturingPublisher, PublishedMessage } from './support/queue';

const SECRET: string = 'int-test-webhook-secret-123456';
const TOKEN: string = 'int-test-token';

interface Me {
    readonly plan: string;
    readonly subscription: {
        readonly status: string;
        readonly card: { readonly brand: string; readonly last4: string } | null;
        readonly paidThrough: string | null;
        readonly graceEndsAt: string | null;
        readonly canResume: boolean;
    } | null;
    readonly openInvoice: { readonly id: string; readonly status: string; readonly totalCents: number } | null;
}

interface Subscribed {
    readonly next: string;
    readonly captureUrl?: string;
}

describe('assinatura na Revtriever (driver fake)', () => {
    let harness: AllocationHarness;
    const publisher: CapturingPublisher = new CapturingPublisher();
    const processed: Set<string> = new Set<string>();

    beforeAll(async () => {
        process.env['REVTRIEVER_WEBHOOK_TOKEN'] = TOKEN;
        process.env['REVTRIEVER_WEBHOOK_SECRETS'] = SECRET;
        harness = await AllocationHarness.start('billing_subscription', publisher);
    });

    afterAll(async () => {
        await harness.stop();
    });

    const events = (): BillingEventsApplication => harness.app.get(BillingEventsApplication, { strict: false });
    const fake = (): FakeBillingEngineDriver => harness.app.get(FakeBillingEngineDriver, { strict: false });

    async function sync(): Promise<void> {
        await harness.app.get(AppContext).run({ requestId: 'int-sync', locale: 'pt-BR' }, async () => syncInContext());
    }

    async function syncInContext(): Promise<void> {
        await events().replay();
        const pending: PublishedMessage[] = publisher
            .ofType(MESSAGE_TYPES.billingRevtrieverEventReceived)
            .filter((message: PublishedMessage) => !processed.has((message.payload as { eventId: string }).eventId));
        for (const message of pending) {
            const eventId: string = (message.payload as { eventId: string }).eventId;
            processed.add(eventId);
            await events().process(eventId);
        }
    }

    async function sweep(): Promise<void> {
        await harness.app.get(AppContext).run({ requestId: 'int-sweep', locale: 'pt-BR' }, async () => {
            await events().sweepStandings();
        });
    }

    async function me(account: Account): Promise<Me> {
        return (await harness.call<Me>(account.token, 'GET', '/billing/me')).body;
    }

    async function engineIdsOf(account: Account): Promise<{ subscription: string; row: string }> {
        const result = await harness.pg.query<{ id: string; engineSubscriptionId: string }>(
            'SELECT id, "engineSubscriptionId" FROM "BillingSubscriptions" WHERE "companyId" = $1 ORDER BY "createdAt" DESC',
            [account.company.id]
        );
        return { subscription: result.rows[0]?.engineSubscriptionId ?? '', row: result.rows[0]?.id ?? '' };
    }

    async function priceOf(account: Account, cycle: number = 1): Promise<{ status: number; text: string }> {
        const body: string = JSON.stringify({
            version: 1,
            mode: 'live',
            pricingRequestId: `p-${String(cycle)}`,
            product: { externalRef: 'vera_premium' },
            subscription: { externalRef: (await engineIdsOf(account)).subscription },
            customer: { externalRef: account.company.id },
            period: { start: '2026-11-10', end: '2026-12-10' },
            cycle,
            currency: 'BRL'
        });
        const response = await harness.callText(
            'POST',
            '/billing/revtriever/price',
            { 'content-type': 'application/json', 'x-revtriever-signature': signatureOf(SECRET, Math.floor(Date.now() / 1000), body) },
            body
        );
        return { status: response.status, text: response.text };
    }

    async function webhook(token: string, body: string, secret: string = SECRET): Promise<number> {
        const response = await harness.callText(
            'POST',
            `/billing/revtriever/events/${token}`,
            { 'content-type': 'application/json', 'x-revtriever-signature': signatureOf(secret, Math.floor(Date.now() / 1000), body) },
            body
        );
        return response.status;
    }

    async function subscribePix(label: string): Promise<Account> {
        const account: Account = await harness.signUp(label);
        const result: ApiResponse<Subscribed> = await harness.call(account.token, 'POST', '/billing/subscription', { method: 'pix' });
        expect(result.status).toBe(201);
        expect(result.body.next).toBe('pay_invoice');
        return account;
    }

    async function payPix(account: Account): Promise<void> {
        await sync();
        const open: Me = await me(account);
        const link = await harness.call<{ url: string; kind: string }>(
            account.token,
            'GET',
            `/billing/invoices/${open.openInvoice?.id ?? ''}/payment-link`
        );
        expect(link.status).toBe(200);
        expect((await harness.callText('GET', new URL(link.body.url).pathname)).status).toBe(200);
        await sync();
    }

    const RULER = [
        { percent: 50, fromCycle: 1, toCycle: 3 },
        { percent: 25, fromCycle: 4, toCycle: 6 }
    ];

    async function redeem(account: Account, options: { kind?: string; days?: number | null; expiresInDays?: number } = {}): Promise<void> {
        const linkId: string = crypto.randomUUID();
        await harness.pg.query(
            `INSERT INTO "SignupLinks" (id, token, label, "trialKind", "trialDays", rules)
             VALUES ($1, $2, 'Parceria', 'none', NULL, '[]'::jsonb)`,
            [linkId, `offer-${crypto.randomUUID()}`]
        );
        await harness.pg.query(
            `INSERT INTO "SignupRedemptions" (id, "companyId", "signupLinkId", source, "trialKind", "trialDays", rules, "redeemedAt", "expiresAt")
             VALUES ($1, $2, $3, 'existing_account', $4, $5, $6::jsonb, now(), now() + make_interval(days => $7))`,
            [
                crypto.randomUUID(),
                account.company.id,
                linkId,
                options.kind ?? 'none',
                options.days ?? null,
                JSON.stringify(RULER),
                options.expiresInDays ?? 30
            ]
        );
    }

    async function amountOf(account: Account, cycle: number): Promise<number> {
        return (JSON.parse((await priceOf(account, cycle)).text) as { amount: number }).amount;
    }

    async function appliedAt(account: Account): Promise<Date | null> {
        const rows = await harness.pg.query<{ appliedAt: Date | null }>(
            'SELECT "appliedAt" FROM "SignupRedemptions" WHERE "companyId" = $1',
            [account.company.id]
        );
        return rows.rows[0]?.appliedAt ?? null;
    }

    function mails(template: string): number {
        return publisher.published.filter((message: PublishedMessage) => (message.payload as { template?: string }).template === template)
            .length;
    }

    it('cartão: assinar devolve a página de captura, o preço espera o cartão, o confirm grava, o preço congela e o pagamento abre o Premium', async () => {
        const account: Account = await harness.signUp('card');

        const subscribed: ApiResponse<Subscribed> = await harness.call(account.token, 'POST', '/billing/subscription', { method: 'card' });
        expect(subscribed.status).toBe(201);
        expect(subscribed.body.next).toBe('card_capture');
        expect((await priceOf(account)).status).toBe(503);

        const captured = await harness.callRedirect(new URL(subscribed.body.captureUrl ?? '').pathname);
        expect(captured.status).toBe(302);
        const confirmed = await harness.call<Me>(account.token, 'POST', '/billing/payment-method/confirm');
        expect(confirmed.status).toBe(200);
        expect(confirmed.body.subscription?.card).toEqual({ brand: 'visa', last4: '4242' });

        const first = await priceOf(account);
        const second = await priceOf(account);
        expect(first.status).toBe(200);
        expect(JSON.parse(first.text)).toEqual({ amount: 1490, description: 'Vera Premium — dezembro de 2026' });
        expect(second.text).toBe(first.text);
        const quotes = await harness.pg.query('SELECT "requestCount" FROM "BillingPriceQuotes" WHERE "companyId" = $1', [
            account.company.id
        ]);
        expect(quotes.rows).toEqual([{ requestCount: 2 }]);

        expect((await me(account)).plan).toBe('free');
        await sync();
        const premium: Me = await me(account);
        expect(premium.plan).toBe('premium');
        expect(premium.subscription?.status).toBe('active');
        expect(mails('premium_activated')).toBeGreaterThan(0);
    });

    it('Pix: a fatura chega por evento, o link de pagamento abre a página e pagar abre o Premium; o mesmo evento duas vezes não repete efeito', async () => {
        const account: Account = await subscribePix('pix');
        await sync();
        const open: Me = await me(account);
        expect(open.openInvoice).toMatchObject({ status: 'issued', totalCents: 1490 });
        expect(open.plan).toBe('free');

        await payPix(account);
        const paid: Me = await me(account);
        expect(paid.plan).toBe('premium');
        expect(paid.openInvoice).toBeNull();
        const history = await harness.call<{ items: { status: string }[]; total: number }>(account.token, 'GET', '/billing/invoices');
        expect(history.body).toMatchObject({ total: 1, items: [{ status: 'paid' }] });
        const activated: number = mails('premium_activated');
        await sync();
        expect(mails('premium_activated')).toBe(activated);
    });

    it('webhook: token errado e assinatura errada dão 401; evento repetido grava uma linha e publica uma vez', async () => {
        const body: string = JSON.stringify({ id: 'evt-dup-1', type: 'product.created', occurredAt: new Date().toISOString(), data: {} });
        const before: number = publisher.ofType(MESSAGE_TYPES.billingRevtrieverEventReceived).length;

        expect(await webhook('outro-token', body)).toBe(401);
        expect(await webhook(TOKEN, body, 'segredo-errado-0123456789')).toBe(401);
        expect(await webhook(TOKEN, body)).toBe(200);
        expect(await webhook(TOKEN, body)).toBe(200);
        expect(await webhook(TOKEN, '{"id":""}')).toBe(400);

        const rows = await harness.pg.query('SELECT count(*)::int AS total FROM "RevtrieverEvents" WHERE "externalEventId" = $1', [
            'evt-dup-1'
        ]);
        expect(rows.rows[0]).toEqual({ total: 1 });
        expect(publisher.ofType(MESSAGE_TYPES.billingRevtrieverEventReceived)).toHaveLength(before + 1);
    });

    it('evento com externalRef de outra company vira failed e nada muda', async () => {
        const victim: Account = await harness.signUp('victim');
        const other: Account = await harness.signUp('other');
        await harness.call(victim.token, 'POST', '/billing/subscription', { method: 'card' });
        const ids = await engineIdsOf(victim);
        const body: string = JSON.stringify({
            id: 'evt-forged-1',
            type: 'invoice.paid',
            data: { subscriptionId: ids.subscription, invoiceId: 'forged-inv', customerExternalRef: other.company.id }
        });

        expect(await webhook(TOKEN, body)).toBe(200);
        await sync();

        const row = await harness.pg.query('SELECT status, error FROM "RevtrieverEvents" WHERE "externalEventId" = $1', ['evt-forged-1']);
        expect(row.rows[0]).toEqual({ status: 'failed', error: 'customer_mismatch' });
        expect((await me(victim)).plan).toBe('free');
        const invoices = await harness.pg.query('SELECT count(*)::int AS total FROM "BillingInvoices" WHERE "companyId" = $1', [
            victim.company.id
        ]);
        expect(invoices.rows[0]).toEqual({ total: 0 });
    });

    it('a reconciliação corrige a fatura paga na Revtriever cujo evento nunca chegou', async () => {
        const account: Account = await subscribePix('reconcile');
        await sync();
        const open: Me = await me(account);
        const link = await harness.call<{ url: string }>(
            account.token,
            'GET',
            `/billing/invoices/${open.openInvoice?.id ?? ''}/payment-link`
        );
        const engineInvoiceId: string = decodeURIComponent(new URL(link.body.url).pathname.split('/').pop() ?? '');
        await fake().payInvoice(engineInvoiceId);

        const result = await harness.app
            .get(AppContext)
            .run({ requestId: 'int-reconcile', locale: 'pt-BR' }, async () => events().reconcile());
        expect(result.fixed).toBeGreaterThanOrEqual(1);
        await sync();

        expect((await me(account)).plan).toBe('premium');
        const synthetic = await harness.pg.query('SELECT count(*)::int AS total FROM "RevtrieverEvents" WHERE "externalEventId" = $1', [
            `reconciliation-${engineInvoiceId}-paid`
        ]);
        expect(synthetic.rows[0]).toEqual({ total: 1 });
    });

    it('fatura vencida: past_due dentro da carência, expired depois dela com o contrato fechado e o aviso, e pagar reabre o Premium', async () => {
        const account: Account = await subscribePix('standing');
        await payPix(account);
        const ids = await engineIdsOf(account);
        await harness.pg.query(
            `INSERT INTO "BillingInvoices" (id, "companyId", "subscriptionId", engine, "engineInvoiceId", status, "totalCents", method, "dueDate", "overdueAt")
             VALUES ($1, $2, $3, 'fake', 'late-1', 'overdue', 1490, 'pix', now() - interval '2 days', now() - interval '1 day')`,
            [crypto.randomUUID(), account.company.id, ids.row]
        );

        await sweep();
        const pastDue: Me = await me(account);
        expect(pastDue.subscription?.status).toBe('past_due');
        expect(pastDue.subscription?.graceEndsAt).not.toBeNull();
        expect(pastDue.plan).toBe('premium');
        expect(mails('premium_past_due')).toBeGreaterThan(0);

        await harness.pg.query(`UPDATE "BillingInvoices" SET "overdueAt" = now() - interval '4 days' WHERE "engineInvoiceId" = 'late-1'`);
        await sweep();
        expect((await me(account)).plan).toBe('free');
        expect((await me(account)).subscription?.status).toBe('expired');
        expect(mails('premium_ended')).toBeGreaterThan(0);

        const body: string = JSON.stringify({
            id: 'evt-late-paid',
            type: 'invoice.paid',
            data: {
                subscriptionId: ids.subscription,
                invoiceId: 'late-1',
                customerExternalRef: account.company.id,
                cycleDate: '2026-11-10'
            }
        });
        expect(await webhook(TOKEN, body)).toBe(200);
        await sync();
        expect((await me(account)).plan).toBe('premium');
    });

    it('cancelar fora do prazo mantém o Premium até o fim do ciclo, recusa novo preço e permite reativar com a primeira cobrança no fim do ciclo', async () => {
        const account: Account = await subscribePix('cancel');
        await payPix(account);
        await harness.pg.query(`UPDATE "BillingSubscriptions" SET "firstPaidAt" = now() - interval '30 days' WHERE "companyId" = $1`, [
            account.company.id
        ]);

        const canceled = await harness.call<Me & { endedNow: boolean }>(account.token, 'POST', '/billing/subscription/cancel');
        expect(canceled.status).toBe(200);
        expect(canceled.body.endedNow).toBe(false);
        expect(canceled.body.subscription?.status).toBe('canceled');
        expect(canceled.body.subscription?.canResume).toBe(true);
        expect(canceled.body.plan).toBe('premium');
        expect(JSON.parse((await priceOf(account, 2)).text)).toEqual({ skip: true });

        const resumed = await harness.call<Me>(account.token, 'POST', '/billing/subscription/resume');
        expect(resumed.status).toBe(200);
        const rows = await harness.pg.query<{ status: string; firstChargeDate: string | null; paidThrough: Date }>(
            'SELECT status, "firstChargeDate", "paidThrough" FROM "BillingSubscriptions" WHERE "companyId" = $1 ORDER BY "createdAt"',
            [account.company.id]
        );
        expect(rows.rows.map((row: { status: string }) => row.status)).toEqual(['canceled', 'active']);
        expect(rows.rows[1]?.firstChargeDate).toBe(rows.rows[0]?.paidThrough.toISOString().slice(0, 10));
        expect((await harness.call(account.token, 'POST', '/billing/subscription/resume')).status).toBe(409);
    });

    it('cancelar dentro do prazo de arrependimento encerra o Premium na hora e registra o pedido de estorno', async () => {
        const account: Account = await subscribePix('withdrawal');
        await payPix(account);

        const canceled = await harness.call<Me & { endedNow: boolean }>(account.token, 'POST', '/billing/subscription/cancel');

        expect(canceled.body.endedNow).toBe(true);
        expect(canceled.body.plan).toBe('free');
        const refunds = await harness.pg.query('SELECT count(*)::int AS total FROM "BillingRefundRequests" WHERE "companyId" = $1', [
            account.company.id
        ]);
        expect(refunds.rows[0]).toEqual({ total: 1 });
    });

    it('duas chamadas de assinar em paralelo resultam em uma assinatura; já Premium recusa', async () => {
        const account: Account = await harness.signUp('parallel');

        const [first, second] = await Promise.all([
            harness.call<Subscribed>(account.token, 'POST', '/billing/subscription', { method: 'pix' }),
            harness.call<Subscribed>(account.token, 'POST', '/billing/subscription', { method: 'pix' })
        ]);

        expect([first.status, second.status].every((status: number) => status === 201 || status === 409)).toBe(true);
        const rows = await harness.pg.query(
            `SELECT count(*)::int AS total FROM "BillingSubscriptions" WHERE "companyId" = $1 AND status IN ('pending','active')`,
            [account.company.id]
        );
        expect(rows.rows[0]).toEqual({ total: 1 });
        await payPix(account);
        const again = await harness.call<{ type: string }>(account.token, 'POST', '/billing/subscription', { method: 'pix' });
        expect(again.status).toBe(409);
        expect(again.body.type).toBe('billing.already_subscribed');
    });

    it('só o dono assina e o link de pagamento de outra company é 404; duas companies nunca se enxergam', async () => {
        const owner: Account = await subscribePix('isolation-a');
        const stranger: Account = await harness.signUp('isolation-b');
        await sync();
        const invoiceId: string = (await me(owner)).openInvoice?.id ?? '';

        const stolen = await harness.call<{ type: string }>(stranger.token, 'GET', `/billing/invoices/${invoiceId}/payment-link`);
        const strangerList = await harness.call<{ total: number }>(stranger.token, 'GET', '/billing/invoices');

        expect(stolen.status).toBe(404);
        expect(stolen.body.type).toBe('billing.invoice_not_found');
        expect(strangerList.body.total).toBe(0);
        expect((await me(stranger)).openInvoice).toBeNull();
        expect((await harness.call(null, 'POST', '/billing/subscription', { method: 'pix' })).status).toBe(401);
    });

    it('a exclusão da conta cancela na Revtriever; com a Revtriever fora grava a pendência e o resgate cancela depois', async () => {
        const cancelled: Account = await subscribePix('erase-ok');
        const outage: Account = await subscribePix('erase-down');
        const eraser: BillingAccountEraser = harness.app.get(BillingAccountEraser, { strict: false });

        expect(await harness.inCompany(cancelled.company.id, async () => eraser.eraseAll(cancelled.company.id))).toBe(1);
        expect((await fake().subscriptionOf((await engineIdsOf(cancelled)).subscription)).status).toBe('canceled');

        const engine: BillingEnginePort = harness.app.get(BillingEnginePort);
        const spy = vi.spyOn(engine, 'cancelSubscription').mockRejectedValueOnce(new Error('fora do ar'));
        expect(await harness.inCompany(outage.company.id, async () => eraser.eraseAll(outage.company.id))).toBe(1);
        spy.mockRestore();
        const pending = await harness.pg.query<{ total: number }>('SELECT count(*)::int AS total FROM "BillingPendingCancellations"');
        expect(pending.rows[0]?.total).toBeGreaterThanOrEqual(1);

        await harness.app
            .get(AppContext)
            .run({ requestId: 'int-rescue', locale: 'pt-BR' }, async () =>
                harness.app.get(SubscriptionApplication, { strict: false }).rescue()
            );
        const left = await harness.pg.query('SELECT count(*)::int AS total FROM "BillingPendingCancellations"');
        expect(left.rows[0]).toEqual({ total: 0 });
        expect((await fake().subscriptionOf((await engineIdsOf(outage)).subscription)).status).toBe('canceled');
    });
    it('assinar com oferta válida grava a régua na assinatura, marca o resgate e o preço sai com o desconto do ciclo', async () => {
        const account: Account = await harness.signUp('offer-ruler');
        await redeem(account);

        expect((await harness.call(account.token, 'POST', '/billing/subscription', { method: 'pix' })).status).toBe(201);

        const stored = await harness.pg.query<{ discountRules: unknown; discountCycleOffset: number }>(
            'SELECT "discountRules", "discountCycleOffset" FROM "BillingSubscriptions" WHERE "companyId" = $1',
            [account.company.id]
        );
        expect(stored.rows[0]).toEqual({ discountRules: RULER, discountCycleOffset: 0 });
        expect(await appliedAt(account)).not.toBeNull();
        expect(JSON.parse((await priceOf(account, 1)).text)).toEqual({
            amount: 745,
            description: 'Vera Premium — dezembro de 2026 (50% de desconto)'
        });
        expect(await amountOf(account, 1)).toBe(745);
        expect(await amountOf(account, 4)).toBe(1118);
        expect(JSON.parse((await priceOf(account, 7)).text)).toEqual({ amount: 1490, description: 'Vera Premium — dezembro de 2026' });
    });

    it('oferta vencida não vale: preço cheio e o resgate fica sem aplicar', async () => {
        const account: Account = await harness.signUp('offer-expired');
        await redeem(account, { expiresInDays: -1 });

        expect((await harness.call(account.token, 'POST', '/billing/subscription', { method: 'pix' })).status).toBe(201);

        expect(await amountOf(account, 1)).toBe(1490);
        expect(await appliedAt(account)).toBeNull();
    });

    it('oferta com teste com cartão adia a primeira cobrança pelos dias do teste', async () => {
        const account: Account = await harness.signUp('offer-card-trial');
        await redeem(account, { kind: 'card', days: 14 });

        expect((await harness.call(account.token, 'POST', '/billing/subscription', { method: 'card' })).status).toBe(201);

        const row = await harness.pg.query<{ firstChargeDate: string }>(
            'SELECT "firstChargeDate" FROM "BillingSubscriptions" WHERE "companyId" = $1',
            [account.company.id]
        );
        const expected: string = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
        expect([expected, new Date(Date.now() + 13 * 86_400_000).toISOString().slice(0, 10)]).toContain(row.rows[0]?.firstChargeDate);
    });

    it('reativar mantém a régua e continua do ciclo em que parou', async () => {
        const account: Account = await harness.signUp('offer-resume');
        await redeem(account);
        expect((await harness.call(account.token, 'POST', '/billing/subscription', { method: 'pix' })).status).toBe(201);
        await payPix(account);
        expect((await priceOf(account, 1)).status).toBe(200);
        expect((await priceOf(account, 2)).status).toBe(200);
        await harness.pg.query(`UPDATE "BillingSubscriptions" SET "firstPaidAt" = now() - interval '30 days' WHERE "companyId" = $1`, [
            account.company.id
        ]);
        expect((await harness.call(account.token, 'POST', '/billing/subscription/cancel')).status).toBe(200);

        expect((await harness.call(account.token, 'POST', '/billing/subscription/resume')).status).toBe(200);

        const rows = await harness.pg.query<{ discountRules: unknown; discountCycleOffset: number }>(
            'SELECT "discountRules", "discountCycleOffset" FROM "BillingSubscriptions" WHERE "companyId" = $1 ORDER BY "createdAt"',
            [account.company.id]
        );
        expect(rows.rows[1]).toEqual({ discountRules: RULER, discountCycleOffset: 2 });
        expect(await amountOf(account, 1)).toBe(745);
        expect(await amountOf(account, 2)).toBe(1118);
    });

    it('evento que chega antes do vínculo da assinatura fica guardado e é aplicado depois do vínculo; passado o prazo, é descartado', async () => {
        const account: Account = await harness.signUp('late-link');
        const eventBody = (id: string): string =>
            JSON.stringify({
                id,
                type: 'invoice.issued',
                occurredAt: new Date().toISOString(),
                data: { subscriptionId: 'late-sub-1', invoiceId: 'late-inv-1', customerExternalRef: account.company.id, totalCents: 1490 }
            });
        expect(await webhook(TOKEN, eventBody('evt-before-link'))).toBe(200);
        await sync();
        const statusOf = async (id: string): Promise<string | undefined> =>
            (await harness.pg.query<{ status: string }>('SELECT status FROM "RevtrieverEvents" WHERE "externalEventId" = $1', [id])).rows[0]
                ?.status;
        expect(await statusOf('evt-before-link')).toBe('received');

        expect((await harness.call(account.token, 'POST', '/billing/subscription', { method: 'pix' })).status).toBe(201);
        await harness.pg.query(`UPDATE "BillingSubscriptions" SET "engineSubscriptionId" = 'late-sub-1' WHERE "companyId" = $1`, [
            account.company.id
        ]);
        await harness.pg.query(
            `UPDATE "RevtrieverEvents" SET "receivedAt" = now() - interval '15 minutes' WHERE "externalEventId" = 'evt-before-link'`
        );
        await sync();
        const row = await harness.pg.query<{ id: string }>('SELECT id FROM "RevtrieverEvents" WHERE "externalEventId" = $1', [
            'evt-before-link'
        ]);
        await harness.app
            .get(AppContext)
            .run({ requestId: 'int-late', locale: 'pt-BR' }, async () => events().process(row.rows[0]?.id ?? ''));

        expect(await statusOf('evt-before-link')).toBe('processed');
        const invoices = await harness.pg.query(
            'SELECT "engineInvoiceId" FROM "BillingInvoices" WHERE "companyId" = $1 AND "engineInvoiceId" = $2',
            [account.company.id, 'late-inv-1']
        );
        expect(invoices.rows).toHaveLength(1);

        expect(await webhook(TOKEN, eventBody('evt-never-linked').replace('late-sub-1', 'nobody-sub'))).toBe(200);
        await harness.pg.query(
            `UPDATE "RevtrieverEvents" SET "receivedAt" = now() - interval '25 hours' WHERE "externalEventId" = 'evt-never-linked'`
        );
        const old = await harness.pg.query<{ id: string }>('SELECT id FROM "RevtrieverEvents" WHERE "externalEventId" = $1', [
            'evt-never-linked'
        ]);
        await harness.app
            .get(AppContext)
            .run({ requestId: 'int-old', locale: 'pt-BR' }, async () => events().process(old.rows[0]?.id ?? ''));
        expect(await statusOf('evt-never-linked')).toBe('ignored');
    });

    it('cancelar, reativar e cancelar de novo respeita o fim do ciclo já pago e o cartão continua na tela', async () => {
        const account: Account = await subscribePix('cancel-twice');
        await payPix(account);
        await harness.pg.query(
            `UPDATE "BillingSubscriptions" SET "firstPaidAt" = now() - interval '30 days', "cardBrand" = 'visa', "cardLast4" = '4242' WHERE "companyId" = $1`,
            [account.company.id]
        );
        expect((await harness.call(account.token, 'POST', '/billing/subscription/cancel')).status).toBe(200);
        const resumed = await harness.call<Me>(account.token, 'POST', '/billing/subscription/resume');
        expect(resumed.status).toBe(200);
        expect(resumed.body.subscription?.card).toEqual({ brand: 'visa', last4: '4242' });

        const again = await harness.call<Me>(account.token, 'POST', '/billing/subscription/cancel');
        expect(again.status).toBe(200);
        expect(again.body.subscription?.status).toBe('canceled');
        expect(again.body.subscription?.paidThrough).not.toBeNull();
        expect(again.body.subscription?.canResume).toBe(true);
        expect(again.body.plan).toBe('premium');

        await harness.pg.query(`UPDATE "BillingSubscriptions" SET "paidThrough" = now() - interval '1 day' WHERE "companyId" = $1`, [
            account.company.id
        ]);
        await sweep();
        const ended: Me = await me(account);
        expect(ended.plan).toBe('free');
        expect(ended.subscription?.status).toBe('expired');
    });
});
