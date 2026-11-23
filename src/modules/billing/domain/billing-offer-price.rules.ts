import { BillingOfferRule } from '../../plans/services/billing-offer.port';

const PERCENT_BASE: number = 100;

export function discountPercentOf(rules: readonly BillingOfferRule[], cycle: number): number {
    const rule: BillingOfferRule | undefined = rules.find(
        (candidate: BillingOfferRule): boolean => cycle >= candidate.fromCycle && cycle <= candidate.toCycle
    );
    return rule?.percent ?? 0;
}

export function discountedPriceOf(priceCents: number, rules: readonly BillingOfferRule[], cycle: number): number {
    return Math.round((priceCents * (PERCENT_BASE - discountPercentOf(rules, cycle))) / PERCENT_BASE);
}
