import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppContext } from '../../src/core/context/app-context.port';
import { BillingEventsApplication } from '../../src/modules/billing/application/billing-events.application';
import { SubscriptionApplication } from '../../src/modules/billing/application/subscription.application';
import { FakeBillingEngineDriver } from '../../src/modules/billing/drivers/fake-billing-engine.driver';
import { signatureOf } from '../../src/modules/billing/drivers/fake-event-delivery.service';
import { MESSAGE_TYPES } from '../../src/shared/constants/queues.constants';
import { DateUtil } from '../../src/shared/utils/date.util';
import { Account, AllocationHarness, ApiResponse } from './support/allocation-harness';
import { CapturingPublisher, PublishedMessage } from './support/queue';

const SECRET: string = 'int-test-webhook-secret-123456';
const TOKEN: string = 'int-test-token';
const TRIAL_DAYS: number = 14;

interface Me {
    readonly plan: string;
    readonly priceCents: number;
    readonly subscription: {
        readonly status: string;
        readonly nextChargeAt: string | null;
        readonly card: { readonly last4: string } | null;
        readonly canResume: boolean;
        readonly graceEndsAt: string | null;
        readonly discount: { readonly percent: number; readonly cycle: number; readonly endsAt: string } | null;
        readonly nextChargeAmountMinor: number | null;
    } | null;
    readonly trial: { readonly kind: string; readonly endsAt: string; readonly daysLeft: number } | null;
}

interface Subscribed {
    readonly next: string;
    readonly captureUrl?: string;
    readonly type?: string;
}

describe('teste com cartão (driver fake)', () => {
    let harness: AllocationHarness;
    const publisher: CapturingPublisher = new CapturingPublisher();
    const processed: Set<string> = new Set<string>();

    beforeAll(async () => {
        process.env['REVTRIEVER_WEBHOOK_TOKEN'] = TOKEN;
        process.env['REVTRIEVER_WEBHOOK_SECRETS'] = SECRET;
        harness = await AllocationHarness.start('billing_card_trial', publisher);
    });

    afterAll(async () => {
        await harness.stop();
    });

    const events = (): BillingEventsApplication => harness.app.get(BillingEventsApplication, { strict: false });
    const fake = (): FakeBillingEngineDriver => harness.app.get(FakeBillingEngineDriver, { strict: false });

    async function inSystem<T>(label: string, fn: () => Promise<T>): Promise<T> {
        return harness.app.get(AppContext).run({ requestId: `int-${label}`, locale: 'pt-BR' }, fn);
    }

    async function sync(): Promise<void> {
        await inSystem('sync', async () => {
            await events().replay();
            const pending: PublishedMessage[] = publisher
                .ofType(MESSAGE_TYPES.billingRevtrieverEventReceived)
                .filter((message: PublishedMessage) => !processed.has((message.payload as { eventId: string }).eventId));
            for (const message of pending) {
                const eventId: string = (message.payload as { eventId: string }).eventId;
                processed.add(eventId);
                await events().process(eventId);
            }
        });
    }

    async function sweepStandings(): Promise<void> {
        await inSystem('standings', async () => events().sweepStandings());
    }

    async function sweepTrials(): Promise<void> {
        await inSystem('trials', async () => harness.app.get(SubscriptionApplication, { strict: false }).sweepTrials());
    }

    async function me(account: Account): Promise<Me> {
        return (await harness.call<Me>(account.token, 'GET', '/billing/me')).body;
    }

    async function engineSubscriptionOf(account: Account): Promise<string> {
        const result = await harness.pg.query<{ engineSubscriptionId: string }>(
            'SELECT "engineSubscriptionId" FROM "BillingSubscriptions" WHERE "companyId" = $1 ORDER BY "createdAt" DESC LIMIT 1',
            [account.company.id]
        );
        return result.rows[0]?.engineSubscriptionId ?? '';
    }

    async function priceOf(account: Account): Promise<{ status: number; text: string }> {
        const body: string = JSON.stringify({
            version: 1,
            mode: 'live',
            pricingRequestId: 'p-1',
            product: { externalRef: 'vera_premium' },
            subscription: { externalRef: await engineSubscriptionOf(account) },
            customer: { externalRef: account.company.id },
            period: { start: '2026-11-10', end: '2026-12-10' },
            cycle: 1,
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

    async function funnelOf(account: Account): Promise<{ trialCount: number; subscriptionCount: number }> {
        const rows = await harness.pg.query<{ trialCount: number; subscriptionCount: number }>(
            `SELECT l."trialCount", l."subscriptionCount" FROM "SignupLinks" l
             JOIN "SignupRedemptions" r ON r."signupLinkId" = l.id WHERE r."companyId" = $1`,
            [account.company.id]
        );
        return rows.rows[0] ?? { trialCount: -1, subscriptionCount: -1 };
    }

    function mails(template: string): number {
        return publisher.published.filter((message: PublishedMessage) => (message.payload as { template?: string }).template === template)
            .length;
    }

    async function redeemCardOffer(label: string): Promise<Account> {
        const account: Account = await harness.signUp(label);
        const linkId: string = crypto.randomUUID();
        await harness.pg.query(
            `INSERT INTO "SignupLinks" (id, token, label, "trialKind", "trialDays", rules)
             VALUES ($1, $2, 'Parceria', 'card', $3, $4::jsonb)`,
            [linkId, `card-trial-${crypto.randomUUID()}`, TRIAL_DAYS, JSON.stringify([{ percent: 50, fromCycle: 1, toCycle: 3 }])]
        );
        await harness.pg.query(
            `INSERT INTO "SignupRedemptions" (id, "companyId", "signupLinkId", source, "trialKind", "trialDays", rules, "redeemedAt", "expiresAt")
             VALUES ($1, $2, $3, 'existing_account', 'card', $4, $5::jsonb, now(), now() + interval '30 days')`,
            [crypto.randomUUID(), account.company.id, linkId, TRIAL_DAYS, JSON.stringify([{ percent: 50, fromCycle: 1, toCycle: 3 }])]
        );
        return account;
    }

    async function subscribeWithCard(account: Account): Promise<string> {
        const result: ApiResponse<Subscribed> = await harness.call(account.token, 'POST', '/billing/subscription', { method: 'card' });
        expect(result.status).toBe(201);
        expect(result.body.next).toBe('card_capture');
        return result.body.captureUrl ?? '';
    }

    async function saveCardAndConfirm(account: Account, captureUrl: string): Promise<Me> {
        expect((await harness.callRedirect(new URL(captureUrl).pathname)).status).toBe(302);
        const confirmed = await harness.call<Me>(account.token, 'POST', '/billing/payment-method/confirm');
        expect(confirmed.status).toBe(200);
        return confirmed.body;
    }

    async function startTrial(label: string): Promise<Account> {
        const account: Account = await redeemCardOffer(label);
        await saveCardAndConfirm(account, await subscribeWithCard(account));
        await sync();
        return account;
    }

    async function endTrialNow(account: Account): Promise<void> {
        await harness.pg.query(`UPDATE "BillingSubscriptions" SET "trialEndsAt" = now() - interval '1 minute' WHERE "companyId" = $1`, [
            account.company.id
        ]);
        await harness.pg.query(`UPDATE "CompanyProducts" SET "trialEndsAt" = now() - interval '1 minute' WHERE "companyId" = $1`, [
            account.company.id
        ]);
    }

    it('assinar com cartão adia a primeira cobrança, o confirm abre o Premium em teste e Pix é recusado', async () => {
        const account: Account = await redeemCardOffer('trial-start');

        const pix = await harness.call<{ type: string }>(account.token, 'POST', '/billing/subscription', { method: 'pix' });
        expect(pix.status).toBe(422);
        expect(pix.body.type).toBe('billing.trial_requires_card');

        const captureUrl: string = await subscribeWithCard(account);
        const timezone = (
            await harness.pg.query<{ timezone: string }>('SELECT timezone FROM "Companies" WHERE id = $1', [account.company.id])
        ).rows[0]?.timezone;
        const row = (
            await harness.pg.query<{ firstChargeDate: string; trialEndsAt: Date; trialStartedAt: Date | null }>(
                'SELECT "firstChargeDate", "trialEndsAt", "trialStartedAt" FROM "BillingSubscriptions" WHERE "companyId" = $1',
                [account.company.id]
            )
        ).rows[0];
        const expectedEnd: Date = DateUtil.addDays(new Date(), TRIAL_DAYS);
        expect(row?.firstChargeDate).toBe(DateUtil.localDateIn(timezone ?? DateUtil.BRAZIL_TIMEZONE, expectedEnd));
        expect(row?.trialStartedAt).toBeNull();
        expect((await me(account)).plan).toBe('free');
        expect(await funnelOf(account)).toEqual({ trialCount: 0, subscriptionCount: 1 });

        const confirmed: Me = await saveCardAndConfirm(account, captureUrl);

        expect(confirmed.plan).toBe('premium');
        expect(confirmed.subscription?.status).toBe('trialing');
        expect(confirmed.subscription?.card?.last4).toBe('4242');
        expect(confirmed.trial).toMatchObject({ kind: 'card' });
        expect(confirmed.trial?.daysLeft).toBeGreaterThanOrEqual(TRIAL_DAYS - 1);
        expect(confirmed.subscription?.nextChargeAt).toBe(confirmed.trial?.endsAt);
        expect(confirmed.subscription?.discount).toMatchObject({ percent: 50, cycle: 1 });
        expect(confirmed.subscription?.nextChargeAmountMinor).toBe(Math.round(confirmed.priceCents / 2));
        expect(mails('premium_trial_started')).toBe(1);
        expect(await funnelOf(account)).toEqual({ trialCount: 1, subscriptionCount: 1 });
        await sync();
        const invoices = await harness.pg.query('SELECT count(*)::int AS total FROM "BillingInvoices" WHERE "companyId" = $1', [
            account.company.id
        ]);
        expect(invoices.rows[0]).toEqual({ total: 0 });
        const marks = await harness.pg.query<{ redemption: Date | null; company: Date | null }>(
            `SELECT (SELECT "trialStartedAt" FROM "SignupRedemptions" WHERE "companyId" = $1) AS redemption,
                    (SELECT "trialStartedAt" FROM "Companies" WHERE id = $1) AS company`,
            [account.company.id]
        );
        expect(marks.rows[0]?.redemption).not.toBeNull();
        expect(marks.rows[0]?.company).not.toBeNull();
        await harness.call(account.token, 'POST', '/billing/payment-method/confirm');
        expect(mails('premium_trial_started')).toBe(1);
        expect((await harness.call(account.token, 'POST', '/billing/subscription', { method: 'card' })).status).toBe(409);
    });

    it('a cobrança do ciclo 1 paga leva a active e converte o contrato do teste em assinatura', async () => {
        const account: Account = await startTrial('trial-paid');
        await endTrialNow(account);

        await fake().releaseFirstCharge(await engineSubscriptionOf(account));
        await sync();

        const paid: Me = await me(account);
        expect(paid.plan).toBe('premium');
        expect(paid.subscription?.status).toBe('active');
        expect(paid.trial).toBeNull();
        const contract = await harness.pg.query<{ source: string }>('SELECT source FROM "CompanyProducts" WHERE "companyId" = $1', [
            account.company.id
        ]);
        expect(contract.rows).toEqual([{ source: 'subscription' }]);
        const standing = await harness.pg.query<{ status: string }>(
            'SELECT status FROM "CompanyBillingStandings" WHERE "companyId" = $1 AND "endsAt" IS NULL',
            [account.company.id]
        );
        expect(standing.rows).toEqual([{ status: 'active' }]);
    });

    it('cancelar no teste mantém o Premium até trialEndsAt, responde skip ao preço, não pede estorno e expira com trial_canceled', async () => {
        const account: Account = await startTrial('trial-cancel');

        const canceled = await harness.call<Me & { endedNow: boolean }>(account.token, 'POST', '/billing/subscription/cancel');

        expect(canceled.status).toBe(200);
        expect(canceled.body.endedNow).toBe(false);
        expect(canceled.body.plan).toBe('premium');
        expect(canceled.body.subscription).toMatchObject({ status: 'canceled', canResume: true });
        expect(JSON.parse((await priceOf(account)).text)).toEqual({ skip: true });
        expect(mails('premium_canceled')).toBeGreaterThan(0);
        const refunds = await harness.pg.query('SELECT count(*)::int AS total FROM "BillingRefundRequests" WHERE "companyId" = $1', [
            account.company.id
        ]);
        expect(refunds.rows[0]).toEqual({ total: 0 });

        await sweepStandings();
        expect((await me(account)).plan).toBe('premium');

        await endTrialNow(account);
        await sweepStandings();

        const ended: Me = await me(account);
        expect(ended.plan).toBe('free');
        expect(ended.subscription?.status).toBe('expired');
        const contract = await harness.pg.query<{ endReason: string }>('SELECT "endReason" FROM "CompanyProducts" WHERE "companyId" = $1', [
            account.company.id
        ]);
        expect(contract.rows).toEqual([{ endReason: 'trial_canceled' }]);
        const standing = await harness.pg.query<{ reason: string }>(
            `SELECT reason FROM "CompanyBillingStandings" WHERE "companyId" = $1 AND "endsAt" IS NULL`,
            [account.company.id]
        );
        expect(standing.rows).toEqual([{ reason: 'trial_canceled' }]);
    });

    it('reativar no teste cria a assinatura nova com a primeira cobrança em trialEndsAt e o teste segue', async () => {
        const account: Account = await startTrial('trial-resume');
        await harness.call(account.token, 'POST', '/billing/subscription/cancel');
        await sync();

        const resumed = await harness.call<Me>(account.token, 'POST', '/billing/subscription/resume');

        expect(resumed.status).toBe(200);
        expect(resumed.body.plan).toBe('premium');
        expect(resumed.body.subscription?.status).toBe('trialing');
        const rows = await harness.pg.query<{ status: string; firstChargeDate: string; trialEndsAt: Date; trialStartedAt: Date | null }>(
            'SELECT status, "firstChargeDate", "trialEndsAt", "trialStartedAt" FROM "BillingSubscriptions" WHERE "companyId" = $1 ORDER BY "createdAt"',
            [account.company.id]
        );
        expect(rows.rows.map((row) => row.status)).toEqual(['canceled', 'active']);
        expect(rows.rows[1]?.trialEndsAt).toEqual(rows.rows[0]?.trialEndsAt);
        expect(rows.rows[1]?.firstChargeDate).toBe(rows.rows[0]?.firstChargeDate);
        expect(rows.rows[1]?.trialStartedAt).not.toBeNull();
        const contract = await harness.pg.query<{ source: string; subscriptionId: string }>(
            'SELECT source, "subscriptionId" FROM "CompanyProducts" WHERE "companyId" = $1',
            [account.company.id]
        );
        expect(contract.rows).toHaveLength(1);
        expect(contract.rows[0]?.source).toBe('card_trial');
        await sync();
        expect((await harness.call(account.token, 'POST', '/billing/subscription/resume')).status).toBe(409);
    });

    it('a primeira fatura vencida em aberto leva a past_due e, esgotada a carência, a expired', async () => {
        const account: Account = await startTrial('trial-overdue');
        await endTrialNow(account);
        const row = (
            await harness.pg.query<{ id: string }>('SELECT id FROM "BillingSubscriptions" WHERE "companyId" = $1', [account.company.id])
        ).rows[0];
        await harness.pg.query(
            `INSERT INTO "BillingInvoices" (id, "companyId", "subscriptionId", engine, "engineInvoiceId", status, "totalCents", method, "dueDate", "overdueAt")
             VALUES ($1, $2, $3, 'fake', 'trial-late-1', 'overdue', 1490, 'card', now() - interval '2 days', now() - interval '1 day')`,
            [crypto.randomUUID(), account.company.id, row?.id]
        );

        await sweepStandings();
        const pastDue: Me = await me(account);
        expect(pastDue.subscription?.status).toBe('past_due');
        expect(pastDue.subscription?.graceEndsAt).not.toBeNull();
        expect(pastDue.plan).toBe('premium');

        await harness.pg.query(
            `UPDATE "BillingInvoices" SET "overdueAt" = now() - interval '4 days' WHERE "engineInvoiceId" = 'trial-late-1'`
        );
        await sweepStandings();
        expect((await me(account)).plan).toBe('free');
        expect((await me(account)).subscription?.status).toBe('expired');
        const contract = await harness.pg.query<{ endReason: string }>('SELECT "endReason" FROM "CompanyProducts" WHERE "companyId" = $1', [
            account.company.id
        ]);
        expect(contract.rows).toEqual([{ endReason: 'expired' }]);
    });

    it('cartão não confirmado em 24 h: a varredura cancela na Revtriever e a oferta continua valendo', async () => {
        const account: Account = await redeemCardOffer('trial-unconfirmed');
        await subscribeWithCard(account);
        const engineId: string = await engineSubscriptionOf(account);
        await harness.pg.query(`UPDATE "BillingSubscriptions" SET "createdAt" = now() - interval '25 hours' WHERE "companyId" = $1`, [
            account.company.id
        ]);

        await sweepTrials();

        expect((await fake().subscriptionOf(engineId)).status).toBe('canceled');
        const rows = await harness.pg.query<{ status: string }>('SELECT status FROM "BillingSubscriptions" WHERE "companyId" = $1', [
            account.company.id
        ]);
        expect(rows.rows).toEqual([{ status: 'canceled' }]);
        expect((await me(account)).plan).toBe('free');
        expect(await funnelOf(account)).toEqual({ trialCount: 0, subscriptionCount: 0 });
        const again = await harness.call<Subscribed>(account.token, 'POST', '/billing/subscription', { method: 'card' });
        expect(again.status).toBe(201);
        const reserved = await harness.pg.query<{ trialEndsAt: Date | null }>(
            `SELECT "trialEndsAt" FROM "BillingSubscriptions" WHERE "companyId" = $1 AND status IN ('pending', 'active')`,
            [account.company.id]
        );
        expect(reserved.rows[0]?.trialEndsAt).not.toBeNull();
    });

    it('3 dias antes do fim o e-mail avisa a data, o valor com desconto e o cartão, uma vez só', async () => {
        const account: Account = await startTrial('trial-ending');
        const before: number = mails('premium_trial_ending');
        await harness.pg.query(`UPDATE "BillingSubscriptions" SET "trialEndsAt" = now() + interval '2 days' WHERE "companyId" = $1`, [
            account.company.id
        ]);

        await sweepTrials();
        await sweepTrials();

        expect(mails('premium_trial_ending')).toBe(before + 1);
        const sent = publisher.published.find(
            (message: PublishedMessage) => (message.payload as { template?: string }).template === 'premium_trial_ending'
        );
        const props = (sent?.payload as { props: Record<string, string> }).props;
        expect(props['cardLast4']).toBe('4242');
        expect(props['amount']).toContain('7,45');
    });

    it('quem assina durante o teste sem cartão recebe o aviso de 3 dias antes da primeira cobrança, uma vez só', async () => {
        const account: Account = await harness.signUp('trial-no-card-subscribed');
        const token: string = `no-card-${crypto.randomUUID()}`;
        await harness.pg.query(
            `INSERT INTO "SignupLinks" (id, token, label, "trialKind", "trialDays", rules, "maxUses", "expiresAt")
             VALUES ($1, $2, 'Parceria', 'no_card', 14, '[]'::jsonb, 10, now() + interval '30 days')`,
            [crypto.randomUUID(), token]
        );
        expect((await harness.call(account.token, 'POST', '/billing/offer/redeem', { token })).status).toBe(200);
        await saveCardAndConfirm(account, await subscribeWithCard(account));
        const before: number = mails('premium_trial_ending');

        await sweepTrials();
        expect(mails('premium_trial_ending')).toBe(before);

        await harness.pg.query(`UPDATE "CompanyProducts" SET "trialEndsAt" = now() + interval '2 days' WHERE "companyId" = $1`, [
            account.company.id
        ]);
        await harness.pg.query(
            `UPDATE "BillingSubscriptions" SET "firstChargeDate" = to_char(now() + interval '2 days', 'YYYY-MM-DD') WHERE "companyId" = $1`,
            [account.company.id]
        );
        await sweepTrials();
        await sweepTrials();

        expect(mails('premium_trial_ending')).toBe(before + 1);
    });
});
