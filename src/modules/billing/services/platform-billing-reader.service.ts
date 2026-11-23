import { Injectable } from '@nestjs/common';
import { BillingPriceQuoteDomain } from '../domain/billing-price-quote.domain';
import { currentCyclePriceOf } from '../domain/billing-price.rules';
import { BillingSubscriptionDomain } from '../domain/billing-subscription.domain';
import { BillingSubscription, STANDING_STATUSES } from '../domain/billing.types';
import { CompanyBillingStandingDomain } from '../domain/company-billing-standing.domain';
import type { BillingOfferRule } from '../../plans/services/billing-offer.port';
import { discountRulesSchema } from '../validation/billing-discount.schemas';

export interface PricedSubscriptionLine {
    readonly subscriptionId: string | null;
    readonly priceCents: number;
}

@Injectable()
export class PlatformBillingReaderService {
    public constructor(
        private readonly standings: CompanyBillingStandingDomain,
        private readonly subscriptions: BillingSubscriptionDomain,
        private readonly quotes: BillingPriceQuoteDomain
    ) {}

    public async pastDueCount(): Promise<number> {
        return (await this.standings.countOpenByStatus())[STANDING_STATUSES.pastDue];
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
