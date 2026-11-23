import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { z } from 'zod';
import { billingConfig } from '../../config/billing.config';
import { BillingProviderDisabledError } from '../../domain/billing-engine.errors';
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
} from '../../domain/billing-engine.types';
import { BillingEnginePort } from '../../ports/billing-engine.port';
import {
    revtrieverCaptureSessionSchema,
    revtrieverEventPageSchema,
    revtrieverInvoicePageSchema,
    revtrieverInvoiceSchema,
    revtrieverPaymentLinkSchema,
    revtrieverSavedCardSchema,
    revtrieverSubscriptionSchema
} from '../../validation/revtriever-responses.schemas';
import { RevtrieverHttp } from './revtriever-http';

const INVOICES_PAGE_SIZE: number = 50;

type SubscriptionResponse = z.infer<typeof revtrieverSubscriptionSchema>;
type InvoiceResponse = z.infer<typeof revtrieverInvoiceSchema>;

function subscriptionOf(response: SubscriptionResponse): EngineSubscription {
    return {
        id: response.id,
        status: response.status,
        planId: response.planId,
        customerId: response.customerId ?? null,
        paymentMethod: response.paymentMethod,
        firstChargeDate: response.firstChargeDate ?? null,
        canceledAt: response.canceledAt ?? null
    };
}

function invoiceOf(response: InvoiceResponse): EngineInvoice {
    return {
        id: response.id,
        subscriptionId: response.subscriptionId,
        status: response.status,
        totalCents: response.totalCents,
        method: response.method ?? null,
        dueDate: response.dueDate ?? null,
        cycleStart: response.cycleStart ?? null,
        cycleEnd: response.cycleEnd ?? null,
        issuedAt: response.issuedAt ?? null,
        paidAt: response.paidAt ?? null,
        overdueAt: response.overdueAt ?? null
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
            config.REVTRIEVER_API_KEY === null
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

    public async createCardCaptureSession(subscriptionId: string, returnUrl: string): Promise<CardCaptureSession> {
        return this.client().request({
            method: 'POST',
            path: `/v1/subscriptions/${segment(subscriptionId)}/card-capture-sessions`,
            body: { returnUrl },
            schema: revtrieverCaptureSessionSchema
        });
    }

    public async savedCardOf(subscriptionId: string): Promise<SavedCard | null> {
        const response: z.infer<typeof revtrieverSavedCardSchema> = await this.client().request({
            method: 'GET',
            path: `/v1/subscriptions/${segment(subscriptionId)}/card`,
            schema: revtrieverSavedCardSchema
        });
        return response.card;
    }

    public async invoiceOf(id: string): Promise<EngineInvoice> {
        const response: InvoiceResponse = await this.client().request({
            method: 'GET',
            path: `/v1/invoices/${segment(id)}`,
            schema: revtrieverInvoiceSchema
        });
        return invoiceOf(response);
    }

    public async invoicesWithStatus(status: OpenInvoiceStatus, page: number): Promise<EnginePage<EngineInvoice>> {
        const query: string = new URLSearchParams({ status, page: String(page), pageSize: String(INVOICES_PAGE_SIZE) }).toString();
        const response: z.infer<typeof revtrieverInvoicePageSchema> = await this.client().request({
            method: 'GET',
            path: `/v1/invoices?${query}`,
            schema: revtrieverInvoicePageSchema
        });
        return { ...response, items: response.items.map(invoiceOf) };
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
        return this.client().request({ method: 'GET', path: `/v1/events?${params.toString()}`, schema: revtrieverEventPageSchema });
    }

    private client(): RevtrieverHttp {
        if (this.http === null) {
            throw new BillingProviderDisabledError();
        }
        return this.http;
    }
}
