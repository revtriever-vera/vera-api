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

function build(goals: Goal[], today: string = '2026-11-23') {
    const build = vi.fn().mockResolvedValue({ holdings: [] });
    const service = new GoalsReaderService(
        {
            list: vi.fn().mockResolvedValue(goals),
            listReal: vi.fn().mockResolvedValue(goals),
            companyIdsDueAcrossTenants: vi.fn().mockResolvedValue(['c1'])
        } as unknown as GoalDomain,
        { build } as unknown as PortfolioSnapshotService,
        { todayInCompany: vi.fn().mockResolvedValue(today) } as unknown as CompanyTimezoneService
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

    it('no dia 1 devolve só os objetivos atrasados', async () => {
        const { service } = build([goalOf({}), goalOf({ id: 'g2', manualMinor: 1_200_000 })], '2026-12-01');

        const due = await service.behindDue();

        expect(due.today).toBe('2026-12-01');
        expect(due.goals).toEqual([
            {
                id: 'g1',
                name: 'Viagem',
                targetMinor: 1_200_000,
                targetDate: '2027-06-15',
                remainingMinor: 1_200_000,
                monthlyMinor: 200_000,
                planMonthlyMinor: 171_429,
                overdue: false
            }
        ]);
    });

    it('fora do dia 1 só avalia o objetivo a 30 dias da data', async () => {
        const { service, build: snapshot } = build([goalOf({})], '2026-12-02');

        expect((await service.behindDue()).goals).toEqual([]);
        expect(snapshot).not.toHaveBeenCalled();
    });

    it('a 30 dias da data o objetivo atrasado entra, e o vencido sai marcado', async () => {
        const { service } = build([goalOf({ targetDate: '2027-01-01' })], '2026-12-02');

        const due = await service.behindDue();

        expect(due.goals.map((goal) => goal.id)).toEqual(['g1']);
        const overdue = build([goalOf({ targetDate: '2026-11-15' })], '2026-12-01');
        expect((await overdue.service.behindDue()).goals[0]?.overdue).toBe(true);
    });

    it('lista as empresas com vencimento pela porta do domínio', async () => {
        const { service } = build([]);

        expect(await service.companyIdsDue('2026-12-01')).toEqual(['c1']);
    });

    it('o resumo sem objetivos não consulta a carteira', async () => {
        const { service, build: snapshot } = build([]);

        expect(await service.overview()).toEqual([]);
        expect(snapshot).not.toHaveBeenCalled();
    });
});
