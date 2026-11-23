import { describe, expect, it } from 'vitest';
import { PlanDomain } from './plan.domain';
import { CompanyCapability, CompanyProduct } from './plans.types';

const line: CompanyProduct = {
    id: 'l1',
    companyId: 'c1',
    productId: 'p1',
    priceCents: '1490',
    startsAt: new Date('2026-11-01T00:00:00Z'),
    endsAt: null,
    source: 'subscription',
    subscriptionId: null,
    endReason: null,
    createdAt: new Date(),
    updatedAt: new Date()
};

function manual(capability: string, granted: boolean): CompanyCapability {
    return { id: capability, companyId: 'c1', capability, origin: 'manual', granted, createdAt: new Date() };
}

describe('PlanDomain.effectivePlanOf', () => {
    it('é free sem linha aberta e premium com ela', () => {
        expect(PlanDomain.effectivePlanOf(null, 'hosted')).toBe('free');
        expect(PlanDomain.effectivePlanOf(line, 'hosted')).toBe('premium');
    });

    it('é self_hosted no modo auto-hospedado, com ou sem linha', () => {
        expect(PlanDomain.effectivePlanOf(null, 'self_hosted')).toBe('self_hosted');
        expect(PlanDomain.effectivePlanOf(line, 'self_hosted')).toBe('self_hosted');
    });
});

describe('PlanDomain.capabilitiesFor', () => {
    it('usa as capacidades do plano e todas no auto-hospedado', () => {
        expect(PlanDomain.capabilitiesFor('free', [], [])).toEqual([]);
        expect(PlanDomain.capabilitiesFor('premium', ['ai', 'whatsapp', 'calendar'], [])).toEqual(['ai', 'whatsapp', 'calendar']);
        expect(PlanDomain.capabilitiesFor('self_hosted', [], [])).toEqual(['ai', 'whatsapp', 'calendar']);
    });

    it('a concessão manual dá uma capacidade ao free', () => {
        expect(PlanDomain.capabilitiesFor('free', [], [manual('ai', true)])).toEqual(['ai']);
    });

    it('a concessão manual tira uma capacidade do premium', () => {
        expect(PlanDomain.capabilitiesFor('premium', ['ai', 'whatsapp', 'calendar'], [manual('whatsapp', false)])).toEqual([
            'ai',
            'calendar'
        ]);
    });
});
