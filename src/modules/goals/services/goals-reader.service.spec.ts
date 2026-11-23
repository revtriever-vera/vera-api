import { describe, expect, it, vi } from 'vitest';
import { GoalDomain } from '../domain/goal.domain';
import { Goal } from '../domain/goals.types';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { PortfolioSnapshotService } from '../../portfolio/services/portfolio-snapshot.service';
import { GoalsReaderService } from './goals-reader.service';

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
        plan: { startMonth: '2026-11-01', startMinor: 0, months: 7 },
        monthStart: { month: '2026-11-01', minor: 0 },
        reserve: null,
        holdings: [],
        createdAt: new Date('2026-11-01T00:00:00Z'),
        updatedAt: new Date('2026-11-01T00:00:00Z'),
        ...overrides
    };
}

function build(goals: Goal[]) {
    const build = vi.fn().mockResolvedValue({ holdings: [] });
    const service = new GoalsReaderService(
        { list: vi.fn().mockResolvedValue(goals) } as unknown as GoalDomain,
        { build } as unknown as PortfolioSnapshotService,
        { todayInCompany: vi.fn().mockResolvedValue('2026-11-23') } as unknown as CompanyTimezoneService
    );
    return { service, build };
}

describe('GoalsReaderService', () => {
    it('sem objetivos não consulta a carteira', async () => {
        const { service, build: snapshot } = build([]);

        expect(await service.need()).toEqual({ monthlyNeededMinor: 0, behindCount: 0 });
        expect(snapshot).not.toHaveBeenCalled();
    });

    it('soma o valor mensal dos objetivos em aberto', async () => {
        const { service } = build([goalOf({}), goalOf({ id: 'g2', targetMinor: 600_000 })]);

        const need = await service.need();

        expect(need.monthlyNeededMinor).toBe(257_144);
        expect(need.behindCount).toBe(0);
    });
});
