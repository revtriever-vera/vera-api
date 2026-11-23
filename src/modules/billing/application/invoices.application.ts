import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { PlanContractService } from '../../plans/services/plan-contract.service';
import {
    BillingEngineRejectedError,
    FirstChargeAwaitingCardError,
    InvalidPriceRequestError,
    InvoiceNotFoundError,
    SubscriptionNotLinkedError,
    UnknownPriceProductError,
    WebhookUnauthorizedError
} from '../domain/billing-engine.errors';
import { PaymentLink } from '../domain/billing-engine.types';
import { BillingInvoiceDomain } from '../domain/billing-invoice.domain';
import { BillingPriceQuoteDomain } from '../domain/billing-price-quote.domain';
import { isPremiumProductRef, PriceResolution, priceDescriptionOf, resolvePrice } from '../domain/billing-price.rules';
import { BillingSubscriptionDomain } from '../domain/billing-subscription.domain';
import {
    BillingInvoice,
    BillingPriceQuote,
    BillingSubscription,
    INVOICES_PAGE_SIZE,
    InvoicePage,
    SUBSCRIPTION_STATUSES
} from '../domain/billing.types';
import { BillingEnginePort } from '../ports/billing-engine.port';
import { discountRulesSchema } from '../validation/billing-discount.schemas';
import { PriceRequest, priceRequestSchema } from '../validation/revtriever-events.schemas';
import { BillingLogService } from '../services/billing-log.service';
import { BillingMetricsService } from '../services/billing-metrics.service';
import { RevtrieverWebhookVerifier } from '../services/revtriever-webhook-verifier.service';
import { IdUtil } from '../../../shared/utils/id.util';

export type PriceAnswer = { readonly amount: number; readonly description: string } | { readonly skip: true };

function parsedPriceRequest(rawBody: string): PriceRequest {
    try {
        const parsed: PriceRequest | undefined = priceRequestSchema.safeParse(JSON.parse(rawBody)).data;
        if (parsed !== undefined) {
            return parsed;
        }
    } catch {
        throw new InvalidPriceRequestError();
    }
    throw new InvalidPriceRequestError();
}

@Injectable()
export class InvoicesApplication {
    public constructor(
        private readonly engine: BillingEnginePort,
        private readonly verifier: RevtrieverWebhookVerifier,
        private readonly contracts: PlanContractService,
        private readonly subscriptions: BillingSubscriptionDomain,
        private readonly invoices: BillingInvoiceDomain,
        private readonly quotes: BillingPriceQuoteDomain,
        private readonly logs: BillingLogService,
        private readonly metrics: BillingMetricsService
    ) {}

    public async list(page: number): Promise<InvoicePage> {
        return this.invoices.pageOfCompany(page, INVOICES_PAGE_SIZE);
    }

    public async paymentLink(id: string): Promise<PaymentLink> {
        const invoice: BillingInvoice | null = IdUtil.isId(id) ? await this.invoices.findById(id) : null;
        if (invoice === null) {
            throw new InvoiceNotFoundError();
        }
        const link: PaymentLink = await this.linkOf(invoice.engineInvoiceId);
        if (invoice.status === 'paid' && link.kind !== 'gateway') {
            throw new InvoiceNotFoundError();
        }
        return link;
    }

    public async price(rawBody: string, signature: string | null): Promise<PriceAnswer> {
        if (this.verifier.refusalOfSignature(rawBody, signature, new Date()) !== null) {
            this.logs.webhookRefused('price_signature');
            throw new WebhookUnauthorizedError();
        }
        const request: PriceRequest = parsedPriceRequest(rawBody);
        if (request.mode === 'test') {
            return { amount: 0, description: priceDescriptionOf(request.period.end) };
        }
        if (!isPremiumProductRef(request.product.externalRef)) {
            throw new UnknownPriceProductError();
        }
        const subscription: BillingSubscription | null = await this.subscriptions.findByEngineSubscriptionIdAcrossTenants(
            this.engine.engine,
            request.subscription.externalRef
        );
        if (subscription?.companyId !== request.customer.externalRef) {
            throw new SubscriptionNotLinkedError();
        }
        return this.quote(subscription.companyId, subscription, request);
    }

    @AsCompany()
    private async quote(_companyId: string, subscription: BillingSubscription, request: PriceRequest): Promise<PriceAnswer> {
        if (subscription.status === SUBSCRIPTION_STATUSES.canceled) {
            this.record('skipped');
            return { skip: true };
        }
        if (subscription.paymentMethod === 'card' && subscription.cardLast4 === null) {
            this.record('awaiting_card');
            throw new FirstChargeAwaitingCardError();
        }
        const resolution: PriceResolution = await this.resolutionOf(subscription, request.cycle);
        const stored: BillingPriceQuote = await this.quotes.quote({
            subscriptionId: subscription.id,
            productRef: request.product.externalRef,
            cycle: request.cycle,
            amountCents: resolution.amountCents,
            description: priceDescriptionOf(request.period.end, resolution.percent)
        });
        this.record('quoted');
        return { amount: Number(stored.amountCents), description: stored.description };
    }

    private async resolutionOf(subscription: BillingSubscription, cycle: number): Promise<PriceResolution> {
        return resolvePrice(
            await this.contracts.priceCentsOf('premium'),
            discountRulesSchema.parse(subscription.discountRules),
            cycle + subscription.discountCycleOffset
        );
    }

    private record(outcome: 'quoted' | 'skipped' | 'awaiting_card'): void {
        this.logs.priceQuoted(outcome);
        this.metrics.priceQuote(outcome);
    }

    private async linkOf(engineInvoiceId: string): Promise<PaymentLink> {
        try {
            return await this.engine.invoicePaymentLinkOf(engineInvoiceId);
        } catch (error: unknown) {
            if (error instanceof BillingEngineRejectedError) {
                throw new InvoiceNotFoundError();
            }
            throw error;
        }
    }
}
