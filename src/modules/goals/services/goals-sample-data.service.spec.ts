import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../../core/context/app-context.port';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { GoalDomain } from '../domain/goal.domain';
import { progressOf } from '../domain/goal-calculator';
import { Goal, GOAL_STATUSES, NewGoalData } from '../domain/goals.types';
import { GoalsSampleDataService } from './goals-sample-data.service';

const TODAY: string = '2026-11-23';

function build(count: number, locale: 'pt-BR' | 'en' = 'pt-BR'): { service: GoalsSampleDataService; created: NewGoalData[] } {
    const created: NewGoalData[] = [];
    const goals: unknown = {
        countAll: vi.fn().mockResolvedValue(count),
        create: vi.fn().mockImplementation((data: NewGoalData): Promise<void> => {
            created.push(data);
            return Promise.resolve();
        }),
        removeSamples: vi.fn().mockResolvedValue(2)
    };
    const service: GoalsSampleDataService = new GoalsSampleDataService(
        goals as GoalDomain,
        { todayInCompany: vi.fn().mockResolvedValue(TODAY) } as unknown as CompanyTimezoneService,
        { get: vi.fn().mockReturnValue({ requestId: 'r', locale }) } as unknown as AppContext
    );
    return { service, created };
}

function statusOf(data: NewGoalData): string {
    const goal: Goal = {
        ...data,
        id: 'g',
        manualUpdatedAt: null,
        holdings: [],
        createdAt: new Date(),
        updatedAt: new Date()
    };
    return progressOf(goal, [], TODAY).status;
}

describe('GoalsSampleDataService', () => {
    it('seeds a reserve on track and a trip behind, marked as sample, in the session locale', async () => {
        const { service, created } = build(0, 'en');

        await expect(service.seed()).resolves.toBe(2);

        expect(created.map((data: NewGoalData) => [data.name, data.isSample, statusOf(data)])).toEqual([
            ['Emergency reserve', true, GOAL_STATUSES.onTrack],
            ['Trip', true, GOAL_STATUSES.behind]
        ]);
        expect(created.every((data: NewGoalData): boolean => data.targetDate > TODAY)).toBe(true);
    });

    it('does not seed when there are already goals, and clear removes only samples', async () => {
        const { service, created } = build(1);

        await expect(service.seed()).resolves.toBe(0);
        await expect(service.clear()).resolves.toBe(2);
        expect(created).toEqual([]);
    });
});
