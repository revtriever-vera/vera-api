import { BillingEngineRejectedError, BillingEngineUnavailableError } from '../domain/billing-engine.errors';
import {
    BillingEngine,
    BillingOperation,
    BillingOutcome,
    CardCaptureSession,
    CreateSubscriptionInput,
    EngineEventPage,
    EngineInvoice,
    EnginePage,
    EngineSubscription,
    OpenInvoiceStatus,
    PaymentLink,
    SavedCard
} from '../domain/billing-engine.types';
import { BillingEnginePort } from '../ports/billing-engine.port';
import { BillingLogService } from '../services/billing-log.service';
import { BillingMetricsService } from '../services/billing-metrics.service';

const HTTP_UNAUTHORIZED: number = 401;

interface Failure {
    readonly outcome: BillingOutcome;
    readonly status: number | null;
    readonly problemType: string | null;
}

function failureOf(error: unknown): Failure {
    if (error instanceof BillingEngineRejectedError) {
        return { outcome: 'rejected', status: error.httpStatus, problemType: error.problemType };
    }
    if (error instanceof BillingEngineUnavailableError) {
        return { outcome: 'unavailable', status: error.httpStatus, problemType: null };
    }
    return { outcome: 'error', status: null, problemType: null };
}

export class ObservedBillingEngine extends BillingEnginePort {
    public readonly engine: BillingEngine;

    public constructor(
        private readonly inner: BillingEnginePort,
        private readonly logs: BillingLogService,
        private readonly metrics: BillingMetricsService
    ) {
        super();
        this.engine = inner.engine;
    }

    public async createSubscription(input: CreateSubscriptionInput): Promise<EngineSubscription> {
        return this.track('create_subscription', async () => this.inner.createSubscription(input));
    }

    public async subscriptionOf(id: string): Promise<EngineSubscription> {
        return this.track('subscription', async () => this.inner.subscriptionOf(id));
    }

    public async cancelSubscription(id: string, idempotencyKey: string): Promise<EngineSubscription> {
        return this.track('cancel_subscription', async () => this.inner.cancelSubscription(id, idempotencyKey));
    }

    public async createCardCaptureSession(subscriptionId: string, returnUrl: string, idempotencyKey: string): Promise<CardCaptureSession> {
        return this.track('card_capture_session', async () =>
            this.inner.createCardCaptureSession(subscriptionId, returnUrl, idempotencyKey)
        );
    }

    public async savedCardOf(subscriptionId: string): Promise<SavedCard | null> {
        return this.track('saved_card', async () => this.inner.savedCardOf(subscriptionId));
    }

    public async invoiceOf(id: string): Promise<EngineInvoice> {
        return this.track('invoice', async () => this.inner.invoiceOf(id));
    }

    public async invoicesWithStatus(status: OpenInvoiceStatus, page: number): Promise<EnginePage<EngineInvoice>> {
        return this.track('invoices', async () => this.inner.invoicesWithStatus(status, page));
    }

    public async invoicePaymentLinkOf(id: string): Promise<PaymentLink> {
        return this.track('payment_link', async () => this.inner.invoicePaymentLinkOf(id));
    }

    public async retryInvoicePricing(id: string): Promise<void> {
        return this.track('retry_pricing', async () => this.inner.retryInvoicePricing(id));
    }

    public async eventsAfter(cursor: string | null, limit: number): Promise<EngineEventPage> {
        return this.track('events', async () => this.inner.eventsAfter(cursor, limit));
    }

    private async track<T>(operation: BillingOperation, call: () => Promise<T>): Promise<T> {
        const startedAt: number = performance.now();
        try {
            const result: T = await call();
            this.record(operation, { outcome: 'ok', status: null, problemType: null }, startedAt);
            return result;
        } catch (error: unknown) {
            this.record(operation, failureOf(error), startedAt);
            throw error;
        }
    }

    private record(operation: BillingOperation, failure: Failure, startedAt: number): void {
        const latencyMs: number = Math.round(performance.now() - startedAt);
        this.metrics.engineCall(operation, failure.outcome, latencyMs);
        this.logs.engineCall({ operation, outcome: failure.outcome, latencyMs, status: failure.status, problemType: failure.problemType });
        if (failure.status === HTTP_UNAUTHORIZED) {
            this.logs.engineUnauthorized(operation);
        }
    }
}
