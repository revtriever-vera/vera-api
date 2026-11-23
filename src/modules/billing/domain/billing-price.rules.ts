import { PREMIUM_PRODUCT_REF } from '../services/billing-catalog-provisioner';

export function isPremiumProductRef(productRef: string): boolean {
    return productRef === PREMIUM_PRODUCT_REF;
}

export function priceDescriptionOf(periodEnd: string, locale: string = 'pt-BR'): string {
    const month: string = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(`${periodEnd.slice(0, 10)}T00:00:00Z`)
    );
    return `Vera Premium — ${month}`;
}
