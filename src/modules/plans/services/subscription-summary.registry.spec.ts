import { DiscoveryService } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { SubscriptionSnapshot } from '../domain/plans.types';
import { SubscriptionSummaryPort } from './subscription-summary.port';
import { SubscriptionSummaryRegistry } from './subscription-summary.registry';

const SNAPSHOT: SubscriptionSnapshot = {
    subscription: {
        status: 'active',
        method: 'pix',
        since: null,
        paidThrough: null,
        nextChargeAt: null,
        card: null,
        graceEndsAt: null,
        withdrawalEndsAt: null,
        canResume: false,
        discount: null,
        nextChargeAmountMinor: null
    },
    openInvoice: null
};

class StubSummary extends SubscriptionSummaryPort {
    public summary(): Promise<SubscriptionSnapshot | null> {
        return Promise.resolve(SNAPSHOT);
    }
}

function discoveryOf(instances: unknown[]): DiscoveryService {
    return { getProviders: () => instances.map((instance: unknown) => ({ instance })) } as unknown as DiscoveryService;
}

describe('SubscriptionSummaryRegistry', () => {
    it('devolve o resumo do módulo que registrou a porta', async () => {
        const registry: SubscriptionSummaryRegistry = new SubscriptionSummaryRegistry(discoveryOf([{}, new StubSummary()]));

        expect(await registry.current()).toBe(SNAPSHOT);
    });

    it('devolve nulo quando nenhum módulo registrou a porta', async () => {
        const registry: SubscriptionSummaryRegistry = new SubscriptionSummaryRegistry(discoveryOf([{}]));

        expect(await registry.current()).toBeNull();
    });
});
