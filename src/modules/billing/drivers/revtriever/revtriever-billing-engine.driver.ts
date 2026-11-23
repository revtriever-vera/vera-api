import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { z } from 'zod';
import { billingConfig } from '../../config/billing.config';
import { BillingProviderDisabledError } from '../../domain/billing-engine.errors';
import {
    BillingEngine,
    CardCaptureSession,
    CreateSubscriptionInput,
    EngineEvent,
    EngineEventPage,
    EngineInvoice,
    EnginePage,
    EngineSubscription,
    ListedInvoiceStatus,
    PaymentLink,
    PaymentMethod,
    SavedCard
} from '../../domain/billing-engine.types';
import { BillingEnginePort } from '../../ports/billing-engine.port';
import {
    revtrieverCaptureSessionSchema,
    revtrieverEventPageSchema,
    revtrieverEventSchema,
    revtrieverInvoicePageSchema,
    revtrieverInvoiceSchema,
    revtrieverPaymentLinkSchema,
    revtrieverSubscriptionSchema
} from '../../validation/revtriever-responses.schemas';
import { RevtrieverHttp } from './revtriever-http';

const INVOICES_PAGE_SIZE: number = 50;

type SubscriptionResponse = z.infer<typeof revtrieverSubscriptionSchema>;
type InvoiceResponse = z.infer<typeof revtrieverInvoiceSchema>;
type CaptureSessionResponse = z.infer<typeof revtrieverCaptureSessionSchema>;
type EventResponse = z.infer<typeof revtrieverEventSchema>;

function subscriptionOf(response: SubscriptionResponse): EngineSubscription {
    return {
        id: response.id,
        status: response.status,
        planId: response.planId,
        customerId: response.customer.id,
        paymentMethod: response.paymentMethod,
        firstChargeDate: null,
        canceledAt: response.canceledAt
    };
}

function methodOf(value: string): PaymentMethod | null {
    return value === 'card' || value === 'pix' ? value : null;
}

function invoiceOf(response: InvoiceResponse): EngineInvoice {
    return {
        id: response.id,
        subscriptionId: response.subscriptionId,
        status: response.status,
        totalCents: response.totalCents,
        method: methodOf(response.paymentMethod),
        dueDate: response.paymentDueDate ?? response.dueDate,
        cycleStart: null,
        cycleEnd: null,
        issuedAt: response.issuedAt,
        paidAt: response.paidAt,
        overdueAt: null
    };
}

function segment(id: string): string {
    return encodeURIComponent(id);
}

@Injectable()
export class RevtrieverBillingEngineDriver extends BillingEnginePort {
    public readonly engine: BillingEngine = 'revtriever';
    private readonly http: RevtrieverHttp | null;
    private readonly gatewayConnectionId: string | null;

    public constructor(@Inject(billingConfig.KEY) config: ConfigType<typeof billingConfig>) {
        super();
        this.gatewayConnectionId = config.REVTRIEVER_GATEWAY_CONNECTION_ID;
        this.http =
            !config.BILLING_ENGINE_ENABLED || config.REVTRIEVER_API_KEY === null
                ? null
                : new RevtrieverHttp({
                      baseUrl: config.REVTRIEVER_API_URL,
                      apiKey: config.REVTRIEVER_API_KEY,
                      timeoutMs: config.REVTRIEVER_TIMEOUT_MS,
                      maxRetries: config.REVTRIEVER_MAX_RETRIES
                  });
    }

    public async createSubscription(input: CreateSubscriptionInput): Promise<EngineSubscription> {
        const gatewayConnectionId: string | undefined = input.gatewayConnectionId ?? this.gatewayConnectionId ?? undefined;
        const response: SubscriptionResponse = await this.client().request({
            method: 'POST',
            path: '/v1/subscriptions',
            idempotencyKey: input.idempotencyKey,
            schema: revtrieverSubscriptionSchema,
            body: {
                planId: input.planId,
                customer: input.customer,
                paymentMethod: input.paymentMethod,
                firstChargeDate: input.firstChargeDate,
                gatewayConnectionId
            }
        });
        return subscriptionOf(response);
    }

    public async subscriptionOf(id: string): Promise<EngineSubscription> {
        const response: SubscriptionResponse = await this.client().request({
            method: 'GET',
            path: `/v1/subscriptions/${segment(id)}`,
            schema: revtrieverSubscriptionSchema
        });
        return subscriptionOf(response);
    }

    public async cancelSubscription(id: string, idempotencyKey: string): Promise<EngineSubscription> {
        const response: SubscriptionResponse = await this.client().request({
            method: 'POST',
            path: `/v1/subscriptions/${segment(id)}/cancel`,
            idempotencyKey,
            body: {},
            schema: revtrieverSubscriptionSchema
        });
        return subscriptionOf(response);
    }

    public async createCardCaptureSession(subscriptionId: string, returnUrl: string, idempotencyKey: string): Promise<CardCaptureSession> {
        const session: CaptureSessionResponse = await this.client().request({
            method: 'POST',
            path: `/v1/subscriptions/${segment(subscriptionId)}/card-capture-sessions`,
            idempotencyKey,
            body: { returnUrl },
            schema: revtrieverCaptureSessionSchema
        });
        return { captureUrl: session.captureUrl, expiresAt: session.expiresAt };
    }

    public async savedCardOf(subscriptionId: string): Promise<SavedCard | null> {
        const response: SubscriptionResponse = await this.client().request({
            method: 'GET',
            path: `/v1/subscriptions/${segment(subscriptionId)}`,
            schema: revtrieverSubscriptionSchema
        });
        return response.card === null ? null : { brand: response.card.brand, last4: response.card.lastFourDigits };
    }

    public async invoiceOf(id: string): Promise<EngineInvoice> {
        const response: InvoiceResponse = await this.client().request({
            method: 'GET',
            path: `/v1/invoices/${segment(id)}`,
            schema: revtrieverInvoiceSchema
        });
        return invoiceOf(response);
    }

    public async invoicesWithStatus(status: ListedInvoiceStatus, page: number): Promise<EnginePage<EngineInvoice>> {
        const query: string = new URLSearchParams({ status, page: String(page), pageSize: String(INVOICES_PAGE_SIZE) }).toString();
        const response: z.infer<typeof revtrieverInvoicePageSchema> = await this.client().request({
            method: 'GET',
            path: `/v1/invoices?${query}`,
            schema: revtrieverInvoicePageSchema
        });
        return {
            items: response.data.map(invoiceOf),
            page: response.pagination.page,
            pageSize: response.pagination.pageSize,
            total: response.pagination.totalRecords
        };
    }

    public async invoicePaymentLinkOf(id: string): Promise<PaymentLink> {
        return this.client().request({
            method: 'GET',
            path: `/v1/invoices/${segment(id)}/payment-link`,
            schema: revtrieverPaymentLinkSchema
        });
    }

    public async retryInvoicePricing(id: string): Promise<void> {
        await this.client().request({
            method: 'POST',
            path: `/v1/invoices/${segment(id)}/retry-pricing`,
            body: {},
            schema: z.unknown()
        });
    }

    public async eventsAfter(cursor: string | null, limit: number): Promise<EngineEventPage> {
        const params: URLSearchParams = new URLSearchParams({ limit: String(limit) });
        if (cursor !== null) {
            params.set('cursor', cursor);
        }
        const page: z.infer<typeof revtrieverEventPageSchema> = await this.client().request({
            method: 'GET',
            path: `/v1/events?${params.toString()}`,
            schema: revtrieverEventPageSchema
        });
        return {
            items: page.data.map((event: EventResponse): EngineEvent => ({
                id: event.id,
                type: event.type,
                createdAt: event.occurredAt,
                data: event.data
            })),
            next: page.nextCursor
        };
    }

    private client(): RevtrieverHttp {
        if (this.http === null) {
            throw new BillingProviderDisabledError();
        }
        return this.http;
    }
}
