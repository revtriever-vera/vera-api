import {
    BillingEngine,
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

export abstract class BillingEnginePort {
    public abstract readonly engine: BillingEngine;
    public abstract createSubscription(input: CreateSubscriptionInput): Promise<EngineSubscription>;
    public abstract subscriptionOf(id: string): Promise<EngineSubscription>;
    public abstract cancelSubscription(id: string, idempotencyKey: string): Promise<EngineSubscription>;
    public abstract createCardCaptureSession(
        subscriptionId: string,
        returnUrl: string,
        idempotencyKey: string
    ): Promise<CardCaptureSession>;
    public abstract savedCardOf(subscriptionId: string): Promise<SavedCard | null>;
    public abstract invoiceOf(id: string): Promise<EngineInvoice>;
    public abstract invoicesWithStatus(status: OpenInvoiceStatus, page: number): Promise<EnginePage<EngineInvoice>>;
    public abstract invoicePaymentLinkOf(id: string): Promise<PaymentLink>;
    public abstract retryInvoicePricing(id: string): Promise<void>;
    public abstract eventsAfter(cursor: string | null, limit: number): Promise<EngineEventPage>;
}
