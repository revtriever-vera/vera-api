export const BILLING_ENGINES = ['fake', 'revtriever'] as const;
export type BillingEngine = (typeof BILLING_ENGINES)[number];

export type PaymentMethod = 'card' | 'pix';
export type PaymentLinkKind = 'payment_page' | 'gateway';
export type ListedInvoiceStatus = 'issued' | 'overdue' | 'paid';

export interface CreateSubscriptionInput {
    readonly idempotencyKey: string;
    readonly planId: string;
    readonly customer: { readonly externalRef: string; readonly name: string; readonly email: string };
    readonly paymentMethod: PaymentMethod;
    readonly firstChargeDate?: string;
    readonly gatewayConnectionId?: string;
}

export interface EngineSubscription {
    readonly id: string;
    readonly status: string;
    readonly planId: string;
    readonly customerId: string | null;
    readonly paymentMethod: PaymentMethod;
    readonly firstChargeDate: string | null;
    readonly canceledAt: string | null;
}

export interface EngineInvoice {
    readonly id: string;
    readonly subscriptionId: string;
    readonly status: string;
    /** Nulo enquanto a fatura espera o valor do endpoint de preço. */
    readonly totalCents: number | null;
    readonly method: PaymentMethod | null;
    readonly dueDate: string | null;
    readonly cycleStart: string | null;
    readonly cycleEnd: string | null;
    readonly issuedAt: string | null;
    readonly paidAt: string | null;
    readonly overdueAt: string | null;
}

export interface EnginePage<T> {
    readonly items: readonly T[];
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
}

export interface EngineEvent {
    readonly id: string;
    readonly type: string;
    readonly createdAt: string;
    readonly data: Readonly<Record<string, unknown>>;
}

export interface EngineEventPage {
    readonly items: readonly EngineEvent[];
    readonly next: string | null;
}

export interface CardCaptureSession {
    readonly captureUrl: string;
    readonly expiresAt: string;
}

export interface SavedCard {
    /** Nula quando o gateway não informa a bandeira. */
    readonly brand: string | null;
    readonly last4: string;
}

export interface PaymentLink {
    readonly url: string;
    readonly kind: PaymentLinkKind;
}

export type BillingOperation =
    | 'create_subscription'
    | 'subscription'
    | 'cancel_subscription'
    | 'card_capture_session'
    | 'saved_card'
    | 'invoice'
    | 'invoices'
    | 'payment_link'
    | 'retry_pricing'
    | 'events';

export type BillingOutcome = 'ok' | 'rejected' | 'unavailable' | 'error';
