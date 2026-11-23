import { describe, expect, it, vi } from 'vitest';
import { GoalDomain } from '../domain/goal.domain';
import { Goal, GOAL_KINDS } from '../domain/goals.types';
import { GoalsAccountExporter } from './goals-account.exporter';

const GOAL: Goal = {
    id: 'g1',
    kind: GOAL_KINDS.emergencyReserve,
    name: 'Reserva',
    targetMinor: 3_000_000,
    targetDate: '2027-06-15',
    holderUserId: 'u1',
    manualMinor: 100,
    manualUpdatedAt: null,
    plan: { startMonth: '2026-11-01', startMinor: 0, months: 7 },
    monthStart: { month: '2026-11-01', minor: 0 },
    reserve: { months: 6, baseMinor: 500_000 },
    holdings: [{ kind: 'position', holdingId: 'h1', shareBps: 2500 }],
    createdAt: new Date('2026-11-01T10:00:00.000Z'),
    updatedAt: new Date('2026-11-02T10:00:00.000Z')
};

describe('GoalsAccountExporter', () => {
    it('exports the real goals and their holding links in two tables', async () => {
        const exporter: GoalsAccountExporter = new GoalsAccountExporter({
            listReal: vi.fn().mockResolvedValue([GOAL])
        } as unknown as GoalDomain);

        expect(exporter.area).toBe('goals');
        await expect(exporter.exportAll()).resolves.toEqual({
            goals: [
                {
                    id: 'g1',
                    kind: 'emergency_reserve',
                    name: 'Reserva',
                    targetMinor: 3_000_000,
                    targetDate: '2027-06-15',
                    holderUserId: 'u1',
                    manualMinor: 100,
                    reserveMonths: 6,
                    createdAt: '2026-11-01T10:00:00.000Z'
                }
            ],
            goalHoldings: [{ goalId: 'g1', holdingKind: 'position', holdingId: 'h1', shareBps: 2500 }]
        });
    });
});
