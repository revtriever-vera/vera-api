import { Injectable } from '@nestjs/common';
import { BillingInvoiceDomain } from '../domain/billing-invoice.domain';
import { BillingPriceQuoteDomain } from '../domain/billing-price-quote.domain';
import { currentCyclePriceOf } from '../domain/billing-price.rules';
import { BillingSubscriptionDomain } from '../domain/billing-subscription.domain';
import { BillingInvoice, BillingSubscription, RevtrieverEvent, STANDING_STATUSES } from '../domain/billing.types';
import { CompanyBillingStandingDomain } from '../domain/company-billing-standing.domain';
import { RevtrieverEventDomain } from '../domain/revtriever-event.domain';
import type { BillingOfferRule } from '../../plans/services/billing-offer.port';
import { discountRulesSchema } from '../validation/billing-discount.schemas';

export interface PlatformOverdueInvoice {
    readonly id: string;
    readonly companyId: string;
    readonly totalCents: number | null;
    readonly dueDate: Date | null;
    readonly overdueAt: Date | null;
}

export interface PlatformBillingEvent {
    readonly id: string;
    readonly type: string;
    readonly status: string;
    readonly receivedAt: Date;
    readonly processedAt: Date | null;
    readonly error: string | null;
}

export interface PlatformBillingStatus {
    readonly pastDueAccounts: number;
    readonly overdueInvoices: PlatformOverdueInvoice[];
    readonly recentEvents: PlatformBillingEvent[];
}

export interface PricedSubscriptionLine {
    readonly subscriptionId: string | null;
    readonly priceCents: number;
}

@Injectable()
export class PlatformBillingReaderService {
    public constructor(
        private readonly standings: CompanyBillingStandingDomain,
        private readonly subscriptions: BillingSubscriptionDomain,
        private readonly quotes: BillingPriceQuoteDomain,
        private readonly invoices: BillingInvoiceDomain,
        private readonly events: RevtrieverEventDomain
    ) {}

    public async pastDueCount(): Promise<number> {
        return (await this.standings.countOpenByStatus())[STANDING_STATUSES.pastDue];
    }

    public async status(limit: number): Promise<PlatformBillingStatus> {
        const overdue: BillingInvoice[] = await this.invoices.listOverdueAcrossTenants(limit);
        const recent: RevtrieverEvent[] = await this.events.listRecent(limit);
        return {
            pastDueAccounts: await this.pastDueCount(),
            overdueInvoices: overdue.map((invoice: BillingInvoice): PlatformOverdueInvoice => ({
                id: invoice.id,
                companyId: invoice.companyId,
                totalCents: invoice.totalCents === null ? null : Number(invoice.totalCents),
                dueDate: invoice.dueDate,
                overdueAt: invoice.overdueAt
            })),
            recentEvents: recent.map((event: RevtrieverEvent): PlatformBillingEvent => ({
                id: event.id,
                type: event.type,
                status: event.status,
                receivedAt: event.receivedAt,
                processedAt: event.processedAt,
                error: event.error
            }))
        };
    }

    /** Sum of what each paid line pays in its current cycle: the base price of the line with the discount of the signup link's ladder, when the cycle is covered by it. */
    public async estimatedMonthlyRevenueCents(lines: readonly PricedSubscriptionLine[]): Promise<number> {
        const ids: string[] = lines.flatMap((line: PricedSubscriptionLine): string[] =>
            line.subscriptionId === null ? [] : [line.subscriptionId]
        );
        const rows: BillingSubscription[] = await this.subscriptions.listByIdsAcrossTenants(ids);
        const subscriptions: Map<string, BillingSubscription> = new Map(
            rows.map((row: BillingSubscription): [string, BillingSubscription] => [row.id, row])
        );
        const cycles: Map<string, number> = await this.quotes.lastCyclesAcrossTenants(ids);
        return lines.reduce(
            (total: number, line: PricedSubscriptionLine): number =>
                total + this.priceOf(line, subscriptions.get(line.subscriptionId ?? ''), cycles.get(line.subscriptionId ?? '') ?? 0),
            0
        );
    }

    private priceOf(line: PricedSubscriptionLine, subscription: BillingSubscription | undefined, lastQuotedCycle: number): number {
        if (subscription === undefined) {
            return line.priceCents;
        }
        const rules: BillingOfferRule[] = discountRulesSchema.parse(subscription.discountRules);
        return currentCyclePriceOf(line.priceCents, rules, lastQuotedCycle, subscription.discountCycleOffset);
    }
}
