import { describe, expect, it } from 'vitest';
import { balanceOf, expectedOf, monthsRemaining, planMonthlyOf, planMonthsBetween, progressOf, shareOfMinor } from './goal-calculator';
import { Goal, GoalPlan, LinkValue } from './goals.types';

const PLAN: GoalPlan = { startMonth: '2026-11-01', startMinor: 0, months: 12 };

function goalOf(overrides: Partial<Goal> = {}): Goal {
    return {
        id: '0192f3a0-7c11-7d3a-9a1e-3f5b6c7d8e90',
        kind: 'travel',
        name: 'Viagem',
        targetMinor: 1_200_000,
        targetDate: '2027-11-15',
        holderUserId: null,
        manualMinor: 0,
        manualUpdatedAt: null,
        plan: PLAN,
        monthStart: { month: '2026-11-01', minor: 0 },
        holdings: [],
        createdAt: new Date('2026-11-01T00:00:00Z'),
        updatedAt: new Date('2026-11-01T00:00:00Z'),
        ...overrides
    };
}

describe('goal calculator', () => {
    it('counts the calendar months left without the current one', () => {
        expect(monthsRemaining('2026-11-23', '2027-06-15')).toBe(7);
        expect(monthsRemaining('2026-11-23', '2026-12-01')).toBe(1);
        expect(monthsRemaining('2026-11-23', '2026-11-30')).toBe(1);
        expect(monthsRemaining('2026-12-31', '2027-01-01')).toBe(1);
        expect(planMonthsBetween('2026-11-01', '2027-11-15')).toBe(12);
    });

    it('rounds the share of a holding half up, in cents', () => {
        expect(shareOfMinor(10_001, 5000)).toBe(5001);
        expect(shareOfMinor(10_000, 3333)).toBe(3333);
        expect(shareOfMinor(1, 5000)).toBe(1);
        expect(shareOfMinor(1, 4999)).toBe(0);
        expect(shareOfMinor(9_000_000_000_000, 10000)).toBe(9_000_000_000_000);
    });

    it('rounds each link and ignores removed holdings', () => {
        const links: LinkValue[] = [
            { shareBps: 5000, holdingValueMinor: 101 },
            { shareBps: 5000, holdingValueMinor: 101 },
            { shareBps: 10000, holdingValueMinor: null }
        ];

        expect(balanceOf(1000, links)).toBe(1000 + 51 + 51);
    });

    it('ceils the monthly amount and never goes below zero', () => {
        const goal: Goal = goalOf({ targetMinor: 1000, targetDate: '2027-01-20', manualMinor: 1 });

        expect(progressOf(goal, [], '2026-11-23').monthlyMinor).toBe(500);
        expect(progressOf(goalOf({ manualMinor: 2_000_000 }), [], '2026-11-23')).toMatchObject({ remainingMinor: 0, monthlyMinor: 0 });
    });

    it('interpolates the reference plan month by month', () => {
        expect(planMonthlyOf(1_200_000, PLAN)).toBe(100_000);
        expect(expectedOf(1_200_000, PLAN, '2026-11-30')).toBe(0);
        expect(expectedOf(1_200_000, PLAN, '2027-01-10')).toBe(200_000);
        expect(expectedOf(1_200_000, PLAN, '2030-01-10')).toBe(1_200_000);
        expect(expectedOf(10, { startMonth: '2026-11-01', startMinor: 0, months: 4 }, '2026-12-01')).toBe(3);
    });

    it('marks done, on track, behind and overdue', () => {
        const today: string = '2027-01-10';

        expect(progressOf(goalOf({ manualMinor: 1_200_000 }), [], today).status).toBe('done');
        expect(progressOf(goalOf({ manualMinor: 200_000 }), [], today).status).toBe('on_track');
        expect(progressOf(goalOf({ manualMinor: 150_000 }), [], today).status).toBe('on_track');
        expect(progressOf(goalOf({ manualMinor: 149_999 }), [], today).status).toBe('behind');
        expect(progressOf(goalOf({ manualMinor: 100 }), [], '2027-11-16').status).toBe('overdue');
        expect(progressOf(goalOf({ manualMinor: 100 }), [], '2027-11-15').status).toBe('behind');
    });

    it('does not flag a goal that just started', () => {
        expect(progressOf(goalOf(), [], '2026-11-23').status).toBe('on_track');
    });

    it('reports the change in the month only when the start of month is the current month', () => {
        const goal: Goal = goalOf({ manualMinor: 380 });

        expect(progressOf(goal, [], '2026-11-23').monthDeltaMinor).toBe(380);
        expect(progressOf(goal, [], '2026-12-02').monthDeltaMinor).toBeNull();
    });

    it('counts the removed holdings', () => {
        const links: LinkValue[] = [
            { shareBps: 100, holdingValueMinor: null },
            { shareBps: 100, holdingValueMinor: 50 }
        ];

        expect(progressOf(goalOf(), links, '2026-11-23').removedHoldings).toBe(1);
    });
});
