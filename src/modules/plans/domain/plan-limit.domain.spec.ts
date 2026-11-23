import { describe, expect, it } from 'vitest';
import { PlanLimitDomain } from './plan-limit.domain';
import { LimitRow } from './plans.types';

const AT: Date = new Date('2026-11-15T00:00:00Z');

function row(quantity: string, startsAt: string, endsAt: string | null): LimitRow {
    return { quantity, startsAt: new Date(startsAt), endsAt: endsAt === null ? null : new Date(endsAt) };
}

describe('PlanLimitDomain.pick', () => {
    it('a linha da company em vigor vence o catálogo', () => {
        const picked: LimitRow | null = PlanLimitDomain.pick(
            [row('9000000', '2026-11-01T00:00:00Z', null)],
            [row('4000000', '2026-01-01T00:00:00Z', null)],
            AT
        );

        expect(picked?.quantity).toBe('9000000');
    });

    it('ignora a linha da company fora da vigência e cai no catálogo', () => {
        const picked: LimitRow | null = PlanLimitDomain.pick(
            [row('9000000', '2026-01-01T00:00:00Z', '2026-11-01T00:00:00Z')],
            [row('4000000', '2026-01-01T00:00:00Z', null)],
            AT
        );

        expect(picked?.quantity).toBe('4000000');
    });

    it('o início é inclusivo e o fim é exclusivo', () => {
        const limit: LimitRow = row('1', '2026-11-15T00:00:00Z', '2026-11-16T00:00:00Z');

        expect(PlanLimitDomain.inForce(limit, AT)).toBe(true);
        expect(PlanLimitDomain.inForce(limit, new Date('2026-11-16T00:00:00Z'))).toBe(false);
    });

    it('sem linha em vigor, não há teto', () => {
        expect(PlanLimitDomain.pick([], [row('1', '2027-01-01T00:00:00Z', null)], AT)).toBeNull();
    });
});
