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

export function priceDescriptionOf(periodEnd: string, percent: number | null = null, locale: string = 'pt-BR'): string {
    const month: string = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(`${periodEnd.slice(0, 10)}T00:00:00Z`)
    );
    const base: string = `Vera Premium — ${month}`;
    return percent === null ? base : `${base} (${String(percent)}% de desconto)`;
}
