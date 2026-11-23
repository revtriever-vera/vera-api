import { describe, expect, it } from 'vitest';
import { goalBehindProps } from './goal-behind-props';
import { behindGoalsPropSchema } from '../validation/goal-notices.schemas';

describe('goalBehindProps', () => {
    it('leva só o objetivo, o que falta e o valor por mês, nunca o id nem ativos', () => {
        const props: Record<string, string> = goalBehindProps(
            [
                {
                    id: 'g1',
                    name: 'Viagem',
                    targetMinor: 1_200_000,
                    targetDate: '2027-06-15',
                    remainingMinor: 888_000,
                    monthlyMinor: 148_000,
                    planMonthlyMinor: 120_000,
                    overdue: false
                }
            ],
            'https://app.example.com'
        );

        expect(props['goalsUrl']).toBe('https://app.example.com/portfolio/goals');
        expect(behindGoalsPropSchema.parse(JSON.parse(props['goals'] ?? ''))).toEqual([
            {
                name: 'Viagem',
                targetMinor: 1_200_000,
                targetDate: '2027-06-15',
                remainingMinor: 888_000,
                monthlyMinor: 148_000,
                planMonthlyMinor: 120_000,
                overdue: false
            }
        ]);
        expect(props['goals']).not.toContain('g1');
    });
});
