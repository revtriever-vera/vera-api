import { describe, expect, it, vi } from 'vitest';
import { BillingSettings, parseBillingConfig } from '../config/billing.config';
import { CreateSubscriptionInput, EngineEvent, EngineSubscription } from '../domain/billing-engine.types';
import { FAKE_PRICE_CENTS, FAKE_TEST_CARD, FakeBillingEngineDriver } from './fake-billing-engine.driver';
import { FakeEventDelivery } from './fake-event-delivery.service';

function build(extra: NodeJS.ProcessEnv = {}): { driver: FakeBillingEngineDriver; delivered: EngineEvent[] } {
    const delivered: EngineEvent[] = [];
    const delivery = { deliver: vi.fn().mockImplementation((event: EngineEvent) => Promise.resolve(void delivered.push(event))) };
    const config: BillingSettings = parseBillingConfig({ IS_LOCAL: 'true', ...extra });
    return { driver: new FakeBillingEngineDriver(config, delivery as unknown as FakeEventDelivery), delivered };
}

function input(overrides: Partial<CreateSubscriptionInput> = {}): CreateSubscriptionInput {
    return {
        idempotencyKey: 'vera-subscription-1',
        planId: 'plan-1',
        customer: { externalRef: 'company-1', name: 'Empresa', email: 'dono@example.test' },
        paymentMethod: 'card',
        ...overrides
    };
}

function typesOf(events: readonly EngineEvent[]): string[] {
    return events.map((event: EngineEvent): string => event.type);
}

describe('FakeBillingEngineDriver', () => {
    it('é idempotente: a mesma chave devolve a mesma assinatura e um só evento de criação', async () => {
        const { driver, delivered } = build();

        const first = await driver.createSubscription(input());
        const second = await driver.createSubscription(input());

        expect(second).toEqual(first);
        expect(typesOf(delivered)).toEqual(['subscription.created']);
        expect(first).toMatchObject({ status: 'pending', planId: 'plan-1', paymentMethod: 'card' });
    });

    it('reusa o cliente pelo externalRef e gera ids estáveis e distintos', async () => {
        const { driver } = build();

        const a = await driver.createSubscription(input());
        const b = await driver.createSubscription(input({ idempotencyKey: 'vera-subscription-2' }));

        expect(b.customerId).toBe(a.customerId);
        expect(b.id).not.toBe(a.id);
        expect(a.id).toBe('fake_sub_000001');
    });

    it('com Pix, emite a fatura na hora e o link de pagamento aponta para a página de dev', async () => {
        const { driver, delivered } = build();
        const subscription = await driver.createSubscription(input({ paymentMethod: 'pix' }));

        const open = await driver.invoicesWithStatus('issued', 1);

        expect(open.items).toHaveLength(1);
        expect(open.items[0]).toMatchObject({ subscriptionId: subscription.id, totalCents: FAKE_PRICE_CENTS, method: 'pix' });
        expect(typesOf(delivered)).toEqual(['subscription.created', 'invoice.issued']);
        const link = await driver.invoicePaymentLinkOf(open.items[0]?.id ?? '');
        expect(link.kind).toBe('payment_page');
        expect(link.url).toBe(`http://localhost:3333/billing/_dev/pay/${open.items[0]?.id ?? ''}`);
    });

    it('pagar pela página de dev paga a fatura, ativa a assinatura e gera invoice.paid com o externalRef', async () => {
        const { driver, delivered } = build();
        const subscription = await driver.createSubscription(input({ paymentMethod: 'pix' }));
        const invoiceId: string = (await driver.invoicesWithStatus('issued', 1)).items[0]?.id ?? '';

        expect(await driver.payInvoice(invoiceId)).toBe(true);
        expect(await driver.payInvoice(invoiceId)).toBe(true);

        expect((await driver.invoiceOf(invoiceId)).status).toBe('paid');
        expect((await driver.subscriptionOf(subscription.id)).status).toBe('active');
        expect(typesOf(delivered).filter((type: string): boolean => type === 'invoice.paid')).toHaveLength(1);
        expect(delivered.at(-1)?.data).toMatchObject({ invoiceId, subscriptionId: subscription.id, customerExternalRef: 'company-1' });
        expect((await driver.invoicesWithStatus('issued', 1)).items).toHaveLength(0);
        expect(await driver.payInvoice('inexistente')).toBe(false);
    });

    it('captura de cartão: sessão, página de dev salva o cartão de teste e cobra a primeira fatura', async () => {
        const { driver, delivered } = build({ FAKE_BILLING_PUBLIC_URL: 'http://localhost:9999/' });
        const subscription = await driver.createSubscription(input());
        expect(await driver.savedCardOf(subscription.id)).toBeNull();

        const session = await driver.createCardCaptureSession(subscription.id, 'https://app.example.test/back', 'key-x');
        const token: string = session.captureUrl.split('/').at(-1) ?? '';
        expect(session.captureUrl.startsWith('http://localhost:9999/billing/_dev/capture/')).toBe(true);
        expect(driver.captureOf(token)?.subscriptionId).toBe(subscription.id);

        expect(await driver.saveTestCard(token)).toBe('https://app.example.test/back');

        expect(await driver.savedCardOf(subscription.id)).toEqual(FAKE_TEST_CARD);
        expect(typesOf(delivered)).toEqual(['subscription.created', 'subscription.card_saved', 'invoice.issued', 'invoice.paid']);
        expect((await driver.subscriptionOf(subscription.id)).status).toBe('active');
        expect(await driver.saveTestCard(token)).toBeNull();
    });

    it('sessão de captura expira', async () => {
        vi.useFakeTimers();
        const { driver } = build();
        const subscription = await driver.createSubscription(input());
        const token: string =
            (await driver.createCardCaptureSession(subscription.id, 'https://app.example.test/back', 'key-x')).captureUrl
                .split('/')
                .at(-1) ?? '';

        vi.advanceTimersByTime(31 * 60 * 1000);

        expect(driver.captureOf(token)).toBeNull();
        expect(driver.captureOf('desconhecido')).toBeNull();
        vi.useRealTimers();
    });

    it('cancela uma vez só por chave e emite subscription.canceled', async () => {
        const { driver, delivered } = build();
        const subscription = await driver.createSubscription(input());

        const first = await driver.cancelSubscription(subscription.id, 'vera-cancel-1');
        const again = await driver.cancelSubscription(subscription.id, 'vera-cancel-1');
        const otherKey = await driver.cancelSubscription(subscription.id, 'vera-cancel-2');

        expect(first.status).toBe('canceled');
        expect(again).toEqual(first);
        expect(otherKey).toEqual(first);
        expect(typesOf(delivered).filter((type: string): boolean => type === 'subscription.canceled')).toHaveLength(1);
    });

    it('lê eventos por cursor, em páginas', async () => {
        const { driver } = build();
        await driver.createSubscription(input({ paymentMethod: 'pix' }));
        await driver.createSubscription(input({ idempotencyKey: 'k2', paymentMethod: 'pix' }));

        const first = await driver.eventsAfter(null, 3);
        const rest = await driver.eventsAfter(first.next, 3);

        expect(first.items).toHaveLength(3);
        expect(first.next).toBe('3');
        expect(rest.items).toHaveLength(1);
        expect(rest.next).toBeNull();
        expect(new Set([...first.items, ...rest.items].map((event: EngineEvent): string => event.id)).size).toBe(4);
    });

    it('pagina as faturas por status', async () => {
        const { driver } = build();
        await driver.createSubscription(input({ paymentMethod: 'pix' }));

        expect((await driver.invoicesWithStatus('issued', 1)).total).toBe(1);
        expect((await driver.invoicesWithStatus('issued', 2)).items).toEqual([]);
        expect((await driver.invoicesWithStatus('overdue', 1)).total).toBe(0);
    });

    it('recusa id desconhecido como rejeição 404 do motor', async () => {
        const { driver } = build();

        await expect(driver.subscriptionOf('x')).rejects.toMatchObject({ code: 'billing.engine_rejected', httpStatus: 404 });
        await expect(driver.invoiceOf('x')).rejects.toMatchObject({ httpStatus: 404 });
        await expect(driver.invoicePaymentLinkOf('x')).rejects.toMatchObject({ httpStatus: 404 });
        await expect(driver.retryInvoicePricing('x')).rejects.toMatchObject({ httpStatus: 404 });
        await expect(driver.savedCardOf('x')).rejects.toMatchObject({ httpStatus: 404 });
        await expect(driver.createCardCaptureSession('x', 'https://a.test', 'key-x')).rejects.toMatchObject({ httpStatus: 404 });
    });

    it('retry de preço numa fatura existente não faz nada', async () => {
        const { driver } = build();
        await driver.createSubscription(input({ paymentMethod: 'pix' }));

        const invoiceId: string = (await driver.invoicesWithStatus('issued', 1)).items[0]?.id ?? '';

        await expect(driver.retryInvoicePricing(invoiceId)).resolves.toBeUndefined();
    });

    it('FAKE_BILLING_FORCE_FAILURE derruba toda operação como indisponível', async () => {
        const { driver } = build({ FAKE_BILLING_FORCE_FAILURE: 'true' });
        const failing: Array<Promise<unknown>> = [
            driver.createSubscription(input()),
            driver.subscriptionOf('a'),
            driver.cancelSubscription('a', 'k'),
            driver.createCardCaptureSession('a', 'https://a.test', 'key-x'),
            driver.savedCardOf('a'),
            driver.invoiceOf('a'),
            driver.invoicesWithStatus('issued', 1),
            driver.invoicePaymentLinkOf('a'),
            driver.retryInvoicePricing('a'),
            driver.eventsAfter(null, 1)
        ];

        for (const call of failing) {
            await expect(call).rejects.toMatchObject({ code: 'billing.provider_unavailable', reason: 'forced_failure', status: 503 });
        }
    });

    it('o tipo de assinatura devolvido não traz dados além do contrato', async () => {
        const { driver } = build();

        const subscription: EngineSubscription = await driver.createSubscription(input({ firstChargeDate: '2026-12-01' }));

        expect(Object.keys(subscription).sort()).toEqual([
            'canceledAt',
            'customerId',
            'firstChargeDate',
            'id',
            'paymentMethod',
            'planId',
            'status'
        ]);
        expect(subscription.firstChargeDate).toBe('2026-12-01');
    });

    it('com a primeira cobrança no futuro não emite fatura nem cobra depois do cartão, e a libera quando a data chega', async () => {
        const { driver, delivered } = build();
        const future: string = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const subscription = await driver.createSubscription(input({ firstChargeDate: future }));
        const session = await driver.createCardCaptureSession(subscription.id, 'http://app.test/plan', 'k1');

        await driver.saveTestCard(session.captureUrl.split('/').pop() ?? '');

        expect(typesOf(delivered)).toEqual(['subscription.created', 'subscription.card_saved']);
        expect((await driver.invoicesWithStatus('issued', 1)).total).toBe(0);

        await driver.releaseFirstCharge(subscription.id);

        expect(typesOf(delivered)).toEqual(['subscription.created', 'subscription.card_saved', 'invoice.issued', 'invoice.paid']);
        await driver.releaseFirstCharge(subscription.id);
        expect(delivered).toHaveLength(4);
    });

    it('com Pix e a primeira cobrança no futuro a fatura só sai quando a data é liberada', async () => {
        const { driver, delivered } = build();
        const future: string = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const subscription = await driver.createSubscription(input({ paymentMethod: 'pix', firstChargeDate: future }));

        expect(typesOf(delivered)).toEqual(['subscription.created']);

        await driver.releaseFirstCharge(subscription.id);

        expect(typesOf(delivered)).toEqual(['subscription.created', 'invoice.issued']);
    });

    it('não libera a cobrança de assinatura cancelada nem de cartão ainda não salvo', async () => {
        const { driver, delivered } = build();
        const waiting = await driver.createSubscription(input());
        const canceled = await driver.createSubscription(input({ idempotencyKey: 'vera-subscription-2', paymentMethod: 'pix' }));
        await driver.cancelSubscription(canceled.id, 'cancel-1');
        const before: number = delivered.length;

        await driver.releaseFirstCharge(waiting.id);
        await driver.releaseFirstCharge(canceled.id);

        expect(delivered).toHaveLength(before);
    });
});
