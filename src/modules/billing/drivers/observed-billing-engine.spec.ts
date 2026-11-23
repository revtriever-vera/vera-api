import { describe, expect, it, vi } from 'vitest';
import { LogService } from '../../../core/observability/log.service';
import { MetricsService } from '../../../core/observability/metrics.service';
import { BillingEngineRejectedError, BillingEngineUnavailableError } from '../domain/billing-engine.errors';
import { BillingEnginePort } from '../ports/billing-engine.port';
import { BillingLogService } from '../services/billing-log.service';
import { BillingMetricsService } from '../services/billing-metrics.service';
import { ObservedBillingEngine } from './observed-billing-engine';

function build(inner: Partial<BillingEnginePort>): {
    engine: ObservedBillingEngine;
    count: ReturnType<typeof vi.fn>;
    observe: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
} {
    const count: ReturnType<typeof vi.fn> = vi.fn();
    const observe: ReturnType<typeof vi.fn> = vi.fn();
    const info: ReturnType<typeof vi.fn> = vi.fn();
    const error: ReturnType<typeof vi.fn> = vi.fn();
    const engine: ObservedBillingEngine = new ObservedBillingEngine(
        { engine: 'fake', ...inner } as BillingEnginePort,
        new BillingLogService({ info, error } as unknown as LogService),
        new BillingMetricsService({ count, observe } as unknown as MetricsService)
    );
    return { engine, count, observe, info, error };
}

describe('ObservedBillingEngine', () => {
    it('herda o driver do que embrulha', () => {
        expect(build({ engine: 'revtriever' }).engine.engine).toBe('revtriever');
    });

    it('mede latência e resultado de uma chamada que deu certo', async () => {
        const { engine, count, observe, info, error } = build({ subscriptionOf: vi.fn().mockResolvedValue({ id: 'sub_1' }) });

        expect(await engine.subscriptionOf('sub_1')).toEqual({ id: 'sub_1' });

        expect(count).toHaveBeenCalledWith('vera_billing_engine_requests_total', { operation: 'subscription', outcome: 'ok' });
        expect(observe).toHaveBeenCalledWith('vera_billing_engine_duration_ms', expect.any(Number), { operation: 'subscription' });
        expect(info).toHaveBeenCalledWith(
            expect.objectContaining({
                identifier: 'billing-engine',
                meta: expect.objectContaining({ operation: 'subscription', outcome: 'ok', latencyMs: expect.any(Number) })
            })
        );
        expect(error).not.toHaveBeenCalled();
    });

    it('conta rejeição, indisponibilidade e erro inesperado e repassa o erro', async () => {
        const rejected = new BillingEngineRejectedError(422, 'engine.invalid');
        const unavailable = new BillingEngineUnavailableError('timeout', null);
        const crash = new Error('x');
        const { engine, count, info } = build({
            invoiceOf: vi.fn().mockRejectedValue(rejected),
            savedCardOf: vi.fn().mockRejectedValue(unavailable),
            retryInvoicePricing: vi.fn().mockRejectedValue(crash)
        });

        await expect(engine.invoiceOf('i')).rejects.toBe(rejected);
        await expect(engine.savedCardOf('s')).rejects.toBe(unavailable);
        await expect(engine.retryInvoicePricing('i')).rejects.toBe(crash);

        expect(count.mock.calls.map((call: unknown[]): unknown => call[1])).toEqual([
            { operation: 'invoice', outcome: 'rejected' },
            { operation: 'saved_card', outcome: 'unavailable' },
            { operation: 'retry_pricing', outcome: 'error' }
        ]);
        expect(info.mock.calls[0]?.[0]).toMatchObject({ meta: { status: 422, problemType: 'engine.invalid' } });
    });

    it('401 da Revtriever sobe como error, sem chave nem corpo', async () => {
        const { engine, error } = build({
            cancelSubscription: vi.fn().mockRejectedValue(new BillingEngineRejectedError(401, 'engine.unauthorized'))
        });

        await expect(engine.cancelSubscription('s', 'k')).rejects.toBeInstanceOf(BillingEngineRejectedError);

        expect(error).toHaveBeenCalledWith(
            expect.objectContaining({ identifier: 'billing-engine', meta: { operation: 'cancel_subscription', status: 401 } })
        );
    });

    it('nunca loga o captureUrl nem o link de pagamento', async () => {
        const { engine, info } = build({
            createCardCaptureSession: vi.fn().mockResolvedValue({ captureUrl: 'https://pay.example.test/segredo-captura', expiresAt: 'x' }),
            invoicePaymentLinkOf: vi.fn().mockResolvedValue({ url: 'https://pay.example.test/segredo-link', kind: 'payment_page' })
        });

        await engine.createCardCaptureSession('s', 'https://back.test');
        await engine.invoicePaymentLinkOf('i');

        expect(JSON.stringify(info.mock.calls)).not.toContain('segredo');
    });

    it('delega todas as operações restantes', async () => {
        const stub = vi.fn().mockResolvedValue('r');
        const { engine, count } = build({
            createSubscription: stub,
            invoicesWithStatus: stub,
            eventsAfter: stub
        });

        await engine.createSubscription({
            idempotencyKey: 'k',
            planId: 'p',
            customer: { externalRef: 'c', name: 'n', email: 'e@example.test' },
            paymentMethod: 'pix'
        });
        await engine.invoicesWithStatus('issued', 1);
        await engine.eventsAfter(null, 5);

        expect(count.mock.calls.map((call: unknown[]): unknown => (call[1] as { operation: string }).operation)).toEqual([
            'create_subscription',
            'invoices',
            'events'
        ]);
    });
});
