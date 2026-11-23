import { describe, expect, it } from 'vitest';
import { PortfolioSnapshot } from '../../portfolio/services/portfolio-snapshot.service';
import { Goal } from '../domain/goals.types';
import { prioritiesOf } from './goal-priority';

const TODAY = '2026-11-23';

function holding(id: string, valueMinor: number, matured = false) {
    return { kind: 'fixed_income', id, valueMinor, matured } as never;
}

function snapshotWith(...holdings: unknown[]): PortfolioSnapshot {
    return { holdings } as unknown as PortfolioSnapshot;
}

function goalOf(overrides: Partial<Goal>): Goal {
    return {
        id: 'g1',
        kind: 'travel',
        name: 'Viagem',
        targetMinor: 1_200_000,
        targetDate: '2027-06-15',
        holderUserId: null,
        manualMinor: 0,
        manualUpdatedAt: null,
        plan: { startMonth: '2026-06-01', startMinor: 0, months: 12 },
        monthStart: { month: '2026-11-01', minor: 0 },
        reserve: null,
        holdings: [{ kind: 'fixed_income', holdingId: 'h1', shareBps: 10_000 }],
        createdAt: new Date('2026-06-01T00:00:00Z'),
        updatedAt: new Date('2026-06-01T00:00:00Z'),
        ...overrides
    };
}

describe('prioritiesOf', () => {
    it('lists a behind goal with its wanted amount and destination', () => {
        const result = prioritiesOf([goalOf({})], snapshotWith(holding('h1', 100_000)), TODAY);

        expect(result).toHaveLength(1);
        expect(result[0]?.destination).toEqual({ kind: 'fixed_income', holdingId: 'h1' });
        expect(result[0]?.wantedMinor).toBe(500_000 - 100_000);
    });

    it('skips goals on track and goals without an eligible holding', () => {
        const onTrack = goalOf({ id: 'a' });
        const noHolding = goalOf({ id: 'b', holdings: [] });
        const matured = goalOf({ id: 'c' });

        expect(prioritiesOf([onTrack], snapshotWith(holding('h1', 900_000)), TODAY)).toEqual([]);
        expect(prioritiesOf([noHolding], snapshotWith(holding('h1', 0)), TODAY)).toEqual([]);
        expect(prioritiesOf([matured], snapshotWith(holding('h1', 0, true)), TODAY)).toEqual([]);
    });

    it('picks the holding with the largest share and orders by nearest date', () => {
        const far = goalOf({ id: 'far', targetDate: '2027-09-01', plan: { startMonth: '2026-06-01', startMinor: 0, months: 15 } });
        const near = goalOf({
            id: 'near',
            holdings: [
                { kind: 'fixed_income', holdingId: 'h1', shareBps: 2_000 },
                { kind: 'fixed_income', holdingId: 'h2', shareBps: 5_000 }
            ]
        });

        const result = prioritiesOf([far, near], snapshotWith(holding('h1', 0), holding('h2', 0)), TODAY);

        expect(result.map((item) => item.goalId)).toEqual(['near', 'far']);
        expect(result[0]?.destination.holdingId).toBe('h2');
    });

    it('an overdue goal wants what is left to reach the target', () => {
        const overdue = goalOf({ targetDate: '2026-10-01' });

        const result = prioritiesOf([overdue], snapshotWith(holding('h1', 200_000)), TODAY);

        expect(result[0]?.wantedMinor).toBe(1_000_000);
    });
});
