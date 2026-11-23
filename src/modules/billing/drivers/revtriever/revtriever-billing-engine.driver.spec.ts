import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseBillingConfig } from '../../config/billing.config';
import { BillingProviderDisabledError } from '../../domain/billing-engine.errors';
import { RevtrieverBillingEngineDriver } from './revtriever-billing-engine.driver';

const SUBSCRIPTION = { id: 'sub_1', status: 'pending', planId: 'plan_1', customerId: 'cus_1', paymentMethod: 'card' };
const INVOICE = { id: 'inv_1', subscriptionId: 'sub_1', status: 'issued', totalCents: 1490, method: 'pix' };

function driverOf(extra: NodeJS.ProcessEnv = {}): RevtrieverBillingEngineDriver {
    return new RevtrieverBillingEngineDriver(
        parseBillingConfig({
            IS_LOCAL: 'true',
            BILLING_ENGINE_DRIVER: 'revtriever',
            REVTRIEVER_API_KEY: 'rk_secret',
            REVTRIEVER_API_URL: 'https://rv.invalid',
            REVTRIEVER_PLAN_ID: 'plan_1',
            ...extra
        })
    );
}

function stubJson(body: unknown): ReturnType<typeof vi.fn> {
    const fetchMock: ReturnType<typeof vi.fn> = vi
        .fn()
        .mockImplementation(() => Promise.resolve(new Response(JSON.stringify(body), { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

function call(fetchMock: ReturnType<typeof vi.fn>): { url: string; init: RequestInit } {
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    return { url, init };
}

describe('RevtrieverBillingEngineDriver', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('cria a assinatura com o cliente inline, a chave de idempotência e a conexão de gateway da config', async () => {
        const fetchMock = stubJson(SUBSCRIPTION);

        const created = await driverOf({ REVTRIEVER_GATEWAY_CONNECTION_ID: 'gw_1' }).createSubscription({
            idempotencyKey: 'vera-subscription-1',
            planId: 'plan_1',
            customer: { externalRef: 'company-1', name: 'Empresa', email: 'dono@example.test' },
            paymentMethod: 'card',
            firstChargeDate: '2026-12-01'
        });

        const { url, init } = call(fetchMock);
        expect(url).toBe('https://rv.invalid/v1/subscriptions');
        expect(init.headers).toMatchObject({ 'idempotency-key': 'vera-subscription-1' });
        expect(JSON.parse(init.body as string)).toEqual({
            planId: 'plan_1',
            customer: { externalRef: 'company-1', name: 'Empresa', email: 'dono@example.test' },
            paymentMethod: 'card',
            firstChargeDate: '2026-12-01',
            gatewayConnectionId: 'gw_1'
        });
        expect(created).toEqual({
            id: 'sub_1',
            status: 'pending',
            planId: 'plan_1',
            customerId: 'cus_1',
            paymentMethod: 'card',
            firstChargeDate: null,
            canceledAt: null
        });
    });

    it('lê e cancela a assinatura nas rotas certas, com o id escapado', async () => {
        const fetchMock = stubJson(SUBSCRIPTION);
        const driver = driverOf();

        await driver.subscriptionOf('sub/1');
        await driver.cancelSubscription('sub_1', 'vera-cancel-1');

        expect(fetchMock.mock.calls[0]?.[0]).toBe('https://rv.invalid/v1/subscriptions/sub%2F1');
        expect(fetchMock.mock.calls[1]?.[0]).toBe('https://rv.invalid/v1/subscriptions/sub_1/cancel');
        expect((fetchMock.mock.calls[1]?.[1] as RequestInit).headers).toMatchObject({ 'idempotency-key': 'vera-cancel-1' });
    });

    it('abre a sessão de captura e lê o cartão salvo', async () => {
        const capture = stubJson({ captureUrl: 'https://pay.example.test/c/1', expiresAt: '2026-12-01T00:00:00Z' });
        const driver = driverOf();

        expect(await driver.createCardCaptureSession('sub_1', 'https://app.example.test/back')).toEqual({
            captureUrl: 'https://pay.example.test/c/1',
            expiresAt: '2026-12-01T00:00:00Z'
        });
        expect(call(capture).url).toBe('https://rv.invalid/v1/subscriptions/sub_1/card-capture-sessions');
        expect(JSON.parse(call(capture).init.body as string)).toEqual({ returnUrl: 'https://app.example.test/back' });

        stubJson({ card: { brand: 'visa', last4: '4242' } });
        expect(await driver.savedCardOf('sub_1')).toEqual({ brand: 'visa', last4: '4242' });
        stubJson({ card: null });
        expect(await driver.savedCardOf('sub_1')).toBeNull();
    });

    it('lê fatura, página de faturas, link de pagamento e pede nova tentativa de preço', async () => {
        const driver = driverOf();
        let fetchMock = stubJson(INVOICE);
        expect((await driver.invoiceOf('inv_1')).totalCents).toBe(1490);
        expect(call(fetchMock).url).toBe('https://rv.invalid/v1/invoices/inv_1');

        fetchMock = stubJson({ items: [INVOICE], page: 2, pageSize: 50, total: 51 });
        const page = await driver.invoicesWithStatus('overdue', 2);
        expect(call(fetchMock).url).toBe('https://rv.invalid/v1/invoices?status=overdue&page=2&pageSize=50');
        expect(page).toMatchObject({ page: 2, total: 51 });
        expect(page.items[0]).toMatchObject({ id: 'inv_1', method: 'pix', dueDate: null });

        fetchMock = stubJson({ url: 'https://pay.example.test/i/1', kind: 'payment_page' });
        expect(await driver.invoicePaymentLinkOf('inv_1')).toEqual({ url: 'https://pay.example.test/i/1', kind: 'payment_page' });
        expect(call(fetchMock).url).toBe('https://rv.invalid/v1/invoices/inv_1/payment-link');

        fetchMock = stubJson({});
        await driver.retryInvoicePricing('inv_1');
        expect(call(fetchMock).url).toBe('https://rv.invalid/v1/invoices/inv_1/retry-pricing');
        expect(call(fetchMock).init.method).toBe('POST');
    });

    it('lê eventos por cursor', async () => {
        const fetchMock = stubJson({
            items: [{ id: 'evt_1', type: 'invoice.paid', createdAt: '2026-12-01T00:00:00Z', data: { a: 1 } }],
            next: 'c2'
        });
        const driver = driverOf();

        expect((await driver.eventsAfter('c1', 100)).next).toBe('c2');
        expect(call(fetchMock).url).toBe('https://rv.invalid/v1/events?limit=100&cursor=c1');

        const first = stubJson({ items: [], next: null });
        await driver.eventsAfter(null, 10);
        expect(call(first).url).toBe('https://rv.invalid/v1/events?limit=10');
    });

    it('sem chave (só no local) toda operação recusa com billing.provider_disabled', async () => {
        const driver = new RevtrieverBillingEngineDriver(parseBillingConfig({ IS_LOCAL: 'true', BILLING_ENGINE_DRIVER: 'revtriever' }));

        await expect(driver.subscriptionOf('sub_1')).rejects.toBeInstanceOf(BillingProviderDisabledError);
        await expect(driver.subscriptionOf('sub_1')).rejects.toMatchObject({ code: 'billing.provider_disabled', status: 503 });
    });
});
