import type { BillingOfferRule } from '../../plans/services/billing-offer.port';
import { PREMIUM_PRODUCT_REF } from '../services/billing-catalog-provisioner';

const PERCENT_BASE: number = 100;

export interface PriceResolution {
    readonly amountCents: number;
    readonly percent: number | null;
}

export function isPremiumProductRef(productRef: string): boolean {
    return productRef === PREMIUM_PRODUCT_REF;
}

export function discountPercentOf(rules: readonly BillingOfferRule[], cycle: number): number | null {
    const rule: BillingOfferRule | undefined = rules.find(
        (candidate: BillingOfferRule): boolean => cycle >= candidate.fromCycle && cycle <= candidate.toCycle
    );
    return rule?.percent ?? null;
}

export function resolvePrice(baseCents: number, rules: readonly BillingOfferRule[], cycle: number): PriceResolution {
    const percent: number | null = discountPercentOf(rules, cycle);
    if (percent === null) {
        return { amountCents: baseCents, percent: null };
    }
    return { amountCents: Math.round((baseCents * (PERCENT_BASE - percent)) / PERCENT_BASE), percent };
}

/** What a subscription pays in the cycle it is in: the last one quoted (the first, before any quote), shifted by the cycles an earlier subscription already used. */
export function currentCyclePriceOf(
    baseCents: number,
    rules: readonly BillingOfferRule[],
    lastQuotedCycle: number,
    cycleOffset: number
): number {
    return resolvePrice(baseCents, rules, Math.max(1, lastQuotedCycle) + cycleOffset).amountCents;
}

export interface DiscountView {
    readonly percent: number;
    readonly cycle: number;
    readonly endsAt: Date;
}

export function discountViewOf(rules: readonly BillingOfferRule[], cycle: number, chargeAt: Date): DiscountView | null {
    const rule: BillingOfferRule | undefined = rules.find(
        (candidate: BillingOfferRule): boolean => cycle >= candidate.fromCycle && cycle <= candidate.toCycle
    );
    if (rule === undefined) {
        return null;
    }
    const endsAt: Date = new Date(chargeAt);
    endsAt.setUTCMonth(endsAt.getUTCMonth() + (rule.toCycle - cycle + 1));
    return { percent: rule.percent, cycle, endsAt };
}

export function priceDescriptionOf(periodEnd: string, percent: number | null = null, locale: string = 'pt-BR'): string {
    const month: string = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(`${periodEnd.slice(0, 10)}T00:00:00Z`)
    );
    const base: string = `Vera Premium — ${month}`;
    return percent === null ? base : `${base} (${String(percent)}% de desconto)`;
}
