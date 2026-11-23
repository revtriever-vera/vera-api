import { describe, expect, it, vi } from 'vitest';
import type { BillingPriceQuoteDomain } from '../domain/billing-price-quote.domain';
import type { BillingSubscriptionDomain } from '../domain/billing-subscription.domain';
import type { BillingSubscription } from '../domain/billing.types';
import type { CompanyBillingStandingDomain } from '../domain/company-billing-standing.domain';
import { PlatformBillingReaderService } from './platform-billing-reader.service';

const LADDER = [{ percent: 50, fromCycle: 1, toCycle: 3 }];

function subscription(id: string, discountRules: unknown, discountCycleOffset: number = 0): BillingSubscription {
    return { id, discountRules, discountCycleOffset } as unknown as BillingSubscription;
}

function build(rows: BillingSubscription[], cycles: Record<string, number>): PlatformBillingReaderService {
    return new PlatformBillingReaderService(
        {} as unknown as CompanyBillingStandingDomain,
        { listByIdsAcrossTenants: vi.fn().mockResolvedValue(rows) } as unknown as BillingSubscriptionDomain,
        { lastCyclesAcrossTenants: vi.fn().mockResolvedValue(new Map(Object.entries(cycles))) } as unknown as BillingPriceQuoteDomain
    );
}

describe('PlatformBillingReaderService.estimatedMonthlyRevenueCents', () => {
    it('soma o que cada assinatura paga no ciclo atual: conta cheia, no ciclo com desconto e depois da régua', async () => {
        const reader = build([subscription('full', []), subscription('inside', LADDER), subscription('after', LADDER)], {
            full: 4,
            inside: 2,
            after: 4
        });

        const total = await reader.estimatedMonthlyRevenueCents([
            { subscriptionId: 'full', priceCents: 2000 },
            { subscriptionId: 'inside', priceCents: 2000 },
            { subscriptionId: 'after', priceCents: 2000 }
        ]);

        expect(total).toBe(2000 + 1000 + 2000);
    });

    it('conta o deslocamento de ciclos herdado de uma assinatura anterior', async () => {
        const reader = build([subscription('moved', LADDER, 3)], { moved: 1 });

        expect(await reader.estimatedMonthlyRevenueCents([{ subscriptionId: 'moved', priceCents: 2000 }])).toBe(2000);
    });

    it('sem cotação ainda, vale o ciclo 1 da régua', async () => {
        const reader = build([subscription('new', LADDER)], {});

        expect(await reader.estimatedMonthlyRevenueCents([{ subscriptionId: 'new', priceCents: 2000 }])).toBe(1000);
    });

    it('linha sem assinatura ligada vale o preço cheio da linha', async () => {
        const reader = build([], {});

        expect(await reader.estimatedMonthlyRevenueCents([{ subscriptionId: null, priceCents: 1500 }])).toBe(1500);
    });
});
