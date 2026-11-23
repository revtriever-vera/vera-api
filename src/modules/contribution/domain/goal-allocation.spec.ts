import { describe, expect, it } from 'vitest';
import { snapshotOf } from '../../../../test/support/contribution-fixtures';
import { makePrototypeSource } from '../../../../test/support/portfolio-fixtures';
import { allocateGoals, GoalWish } from './goal-allocation';

const snapshot = snapshotOf(makePrototypeSource());
const target = snapshot.holdings.find((holding) => !holding.matured && holding.classId !== null)!;

function wish(goalId: string, wantedMinor: number, date = '2027-01-01'): GoalWish {
    return {
        goalId,
        kind: 'travel',
        name: goalId,
        targetDate: date,
        wantedMinor,
        destination: { kind: target.kind, holdingId: target.id }
    };
}

describe('allocateGoals', () => {
    it('serves the wishes in order until the amount runs out', () => {
        const result = allocateGoals(snapshot, [wish('a', 400_000), wish('b', 400_000)], 600_000);

        expect(result.goals.map((goal) => goal.amountMinor)).toEqual([400_000, 200_000]);
        expect(result.goalsAmountMinor).toBe(600_000);
    });

    it('counts the goal money in the holding, its class and the total', () => {
        const result = allocateGoals(snapshot, [wish('a', 100_000)], 500_000);

        const after = result.snapshot.holdings.find((holding) => holding.id === target.id)!;
        const classBefore = snapshot.classes.find((item) => item.classId === target.classId)!;
        const classAfter = result.snapshot.classes.find((item) => item.classId === target.classId)!;
        expect(after.valueMinor).toBe(target.valueMinor + 100_000);
        expect(classAfter.valueMinor).toBe(classBefore.valueMinor + 100_000);
        expect(result.snapshot.totalMinor).toBe(snapshot.totalMinor + 100_000);
    });

    it('ignores a wish whose holding is not in the portfolio', () => {
        const ghost: GoalWish = { ...wish('a', 100_000), destination: { kind: 'position', holdingId: 'missing' } };

        const result = allocateGoals(snapshot, [ghost], 500_000);

        expect(result.goals).toEqual([]);
        expect(result.goalsAmountMinor).toBe(0);
    });
});
