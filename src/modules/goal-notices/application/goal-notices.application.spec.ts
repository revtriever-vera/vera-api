import { describe, expect, it, vi } from 'vitest';
import { ContextHolder } from '../../../core/context/as-company.decorator';
import { AppContext } from '../../../core/context/app-context.port';
import { BehindGoal, GoalsReaderService } from '../../goals/services/goals-reader.service';
import { NoticeService } from '../../notices/services/notice.service';
import { GoalNoticeMarkDomain } from '../domain/goal-notice-mark.domain';
import { GoalNoticesLogService } from '../services/goal-notices-log.service';
import { GoalNoticesPublisherService } from '../services/goal-notices-publisher.service';
import { GoalNoticesApplication } from './goal-notices.application';

function behind(id: string): BehindGoal {
    return {
        id,
        name: `Objetivo ${id}`,
        targetMinor: 1_000_000,
        targetDate: '2027-06-15',
        remainingMinor: 500_000,
        monthlyMinor: 100_000,
        planMonthlyMinor: 80_000,
        overdue: false
    };
}

function build(due: BehindGoal[], marked: string[] = []) {
    ContextHolder.set({
        get: () => ({}),
        run: (_context: unknown, fn: () => Promise<unknown>) => fn()
    } as unknown as AppContext);
    const notify = vi.fn().mockResolvedValue({ sent: 1, skipped: 0 });
    const mark = vi.fn().mockResolvedValue(true);
    const request = vi.fn().mockResolvedValue(undefined);
    const evaluated = vi.fn();
    const application = new GoalNoticesApplication(
        {
            behindDue: vi.fn().mockResolvedValue({ today: '2026-12-01', goals: due }),
            companyIdsDue: vi.fn().mockResolvedValue(['c1', 'c2'])
        } as unknown as GoalsReaderService,
        { notify } as unknown as NoticeService,
        { markedGoalIds: vi.fn().mockResolvedValue(new Set(marked)), mark } as unknown as GoalNoticeMarkDomain,
        { request } as unknown as GoalNoticesPublisherService,
        { evaluated, fanOut: vi.fn() } as unknown as GoalNoticesLogService,
        { APP_URL: 'https://app.example.com' }
    );
    return { application, notify, mark, request, evaluated };
}

describe('GoalNoticesApplication', () => {
    it('a varredura diária pede uma avaliação por empresa vencida, com o dia no jobId', async () => {
        const { application, request } = build([]);

        const total: number = await application.fanOutDaily(new Date('2026-12-01T12:00:00Z'));

        expect(total).toBe(2);
        expect(request).toHaveBeenCalledWith('c1', '2026-12-01');
        expect(request).toHaveBeenCalledWith('c2', '2026-12-01');
    });

    it('avisa os atrasados que ainda não têm marca do mês e marca depois do envio', async () => {
        const { application, notify, mark } = build([behind('a'), behind('b')], ['a']);

        const total: number = await application.evaluate('c1');

        expect(total).toBe(1);
        expect(notify).toHaveBeenCalledTimes(1);
        const request = notify.mock.calls[0]?.[1] as { type: string; key: string; props: Record<string, string> };
        expect(request.type).toBe('goal_behind');
        expect(request.key).toBe('2026-12-01');
        expect(JSON.parse(request.props['goals'] ?? '[]')).toHaveLength(1);
        expect(mark).toHaveBeenCalledWith('b', '2026-12');
        expect(mark).not.toHaveBeenCalledWith('a', '2026-12');
    });

    it('sem atrasado pendente não envia nada', async () => {
        const none = build([]);
        const allMarked = build([behind('a')], ['a']);

        expect(await none.application.evaluate('c1')).toBe(0);
        expect(await allMarked.application.evaluate('c1')).toBe(0);
        expect(none.notify).not.toHaveBeenCalled();
        expect(allMarked.notify).not.toHaveBeenCalled();
    });

    it('se o envio falha não marca, para o reenvio refazer o aviso', async () => {
        const { application, notify, mark } = build([behind('a')]);
        notify.mockRejectedValueOnce(new Error('fila fora'));

        await expect(application.evaluate('c1')).rejects.toThrow('fila fora');

        expect(mark).not.toHaveBeenCalled();
    });
});
