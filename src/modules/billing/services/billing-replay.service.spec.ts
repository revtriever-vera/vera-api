import { describe, expect, it, vi } from 'vitest';
import { BillingSettings, parseBillingConfig } from '../config/billing.config';
import { EngineEvent, EngineInvoice } from '../domain/billing-engine.types';
import { BillingInvoiceDomain } from '../domain/billing-invoice.domain';
import { BillingSubscriptionDomain } from '../domain/billing-subscription.domain';
import { RevtrieverEventCursorDomain } from '../domain/revtriever-event-cursor.domain';
import { RevtrieverEventDomain } from '../domain/revtriever-event.domain';
import { FakeBillingEngineDriver } from '../drivers/fake-billing-engine.driver';
import { FakeEventDelivery } from '../drivers/fake-event-delivery.service';
import { WebhookEvent } from '../validation/revtriever-events.schemas';
import { BillingLogService } from './billing-log.service';
import { BillingReplayService } from './billing-replay.service';
import { RevtrieverEventIngestService } from './revtriever-event-ingest.service';

interface Harness {
    readonly engine: FakeBillingEngineDriver;
    readonly service: BillingReplayService;
    readonly mirrored: Set<string>;
    readonly ingested: WebhookEvent[];
    readonly logs: { reconciled: ReturnType<typeof vi.fn> };
}

function build(env: NodeJS.ProcessEnv = {}): Harness {
    const delivery = {
        quote: vi.fn().mockResolvedValue(null),
        deliver: vi.fn().mockImplementation((_event: EngineEvent) => Promise.resolve())
    };
    const config: BillingSettings = parseBillingConfig({ IS_LOCAL: 'true', ...env });
    const engine: FakeBillingEngineDriver = new FakeBillingEngineDriver(config, delivery as unknown as FakeEventDelivery);
    const mirrored: Set<string> = new Set<string>();
    const ingested: WebhookEvent[] = [];
    const seen: Set<string> = new Set<string>();
    const ingestion = {
        ingest: vi.fn().mockImplementation((event: WebhookEvent) => {
            if (seen.has(event.id)) {
                return Promise.resolve(false);
            }
            seen.add(event.id);
            ingested.push(event);
            mirrored.add(String(event.data['invoiceId']));
            return Promise.resolve(true);
        })
    };
    const invoices = {
        listOpenAcrossTenants: vi.fn().mockResolvedValue([]),
        existsByEngineIdAcrossTenants: vi.fn().mockImplementation((_engine: string, id: string) => Promise.resolve(mirrored.has(id)))
    };
    const subscriptions = {
        findByEngineSubscriptionIdAcrossTenants: vi
            .fn()
            .mockImplementation((_engine: string, id: string) => Promise.resolve(id.startsWith('unlinked') ? null : { id: `local-${id}` }))
    };
    const logs = { reconciled: vi.fn() };
    const service: BillingReplayService = new BillingReplayService(
        engine,
        ingestion as unknown as RevtrieverEventIngestService,
        {} as RevtrieverEventDomain,
        {} as RevtrieverEventCursorDomain,
        invoices as unknown as BillingInvoiceDomain,
        subscriptions as unknown as BillingSubscriptionDomain,
        config,
        logs as unknown as BillingLogService
    );
    return { engine, service, mirrored, ingested, logs };
}

async function pixSubscription(engine: FakeBillingEngineDriver, key: string): Promise<string> {
    const subscription = await engine.createSubscription({
        idempotencyKey: key,
        planId: 'plan-1',
        customer: { externalRef: `company-${key}`, name: 'Empresa', email: 'dono@example.test' },
        paymentMethod: 'pix'
    });
    return subscription.id;
}

describe('BillingReplayService.reconcile: fatura que existe só na Revtriever', () => {
    it('cria a fatura que a Vera nunca recebeu e registra created no log', async () => {
        const { engine, service, mirrored, ingested, logs } = build();
        const subscriptionId: string = await pixSubscription(engine, 'a');
        const remote: EngineInvoice | undefined = (await engine.invoicesWithStatus('issued', 1)).items.find(
            (invoice: EngineInvoice): boolean => invoice.subscriptionId === subscriptionId
        );

        const result = await service.reconcile();

        expect(result).toEqual({ checked: 1, fixed: 0, created: 1 });
        expect(mirrored.has(remote?.id ?? '')).toBe(true);
        expect(ingested[0]).toMatchObject({ type: 'invoice.issued', data: { invoiceId: remote?.id, subscriptionId } });
        expect(logs.reconciled).toHaveBeenCalledWith(1, 0, 1);
    });

    it('rodar duas vezes não duplica', async () => {
        const { engine, service, ingested } = build();
        await pixSubscription(engine, 'a');

        await service.reconcile();
        const second = await service.reconcile();

        expect(second.created).toBe(0);
        expect(ingested).toHaveLength(1);
    });

    it('ignora fatura de assinatura que a Vera não conhece', async () => {
        const { engine, service, ingested } = build();
        await engine.createSubscription({
            idempotencyKey: 'unlinked',
            planId: 'plan-1',
            customer: { externalRef: 'company-x', name: 'Empresa', email: 'dono@example.test' },
            paymentMethod: 'pix'
        });
        vi.spyOn(engine, 'invoicesWithStatus').mockImplementation(async (status, page) => {
            const real = FakeBillingEngineDriver.prototype.invoicesWithStatus.call(engine, status, page);
            const result = await real;
            return { ...result, items: result.items.map((invoice) => ({ ...invoice, subscriptionId: 'unlinked-1' })) };
        });

        const result = await service.reconcile();

        expect(result.created).toBe(0);
        expect(ingested).toHaveLength(0);
    });

    it('não olha fatura fora da janela configurada', async () => {
        const { engine, service, ingested } = build({ BILLING_RECONCILE_WINDOW_DAYS: '2' });
        await pixSubscription(engine, 'a');
        const old: string = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
        vi.spyOn(engine, 'invoicesWithStatus').mockImplementation(async (status, page) => {
            const result = await FakeBillingEngineDriver.prototype.invoicesWithStatus.call(engine, status, page);
            return { ...result, items: result.items.map((invoice) => ({ ...invoice, issuedAt: old, dueDate: old })) };
        });

        const result = await service.reconcile();

        expect(result).toEqual({ checked: 0, fixed: 0, created: 0 });
        expect(ingested).toHaveLength(0);
    });

    it('com o motor fora do ar a reconciliação termina sem criar nada', async () => {
        const { engine, service } = build();
        vi.spyOn(engine, 'invoicesWithStatus').mockRejectedValue(new Error('down'));

        await expect(service.reconcile()).resolves.toEqual({ checked: 0, fixed: 0, created: 0 });
    });
});
