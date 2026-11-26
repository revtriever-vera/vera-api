import { describe, expect, it, vi } from 'vitest';
import { ContextHolder } from '../../../core/context/as-company.decorator';
import { AppContext } from '../../../core/context/app-context.port';
import { NoticeService } from '../../notices/services/notice.service';
import { PlanGateService } from '../../plans/services/plan-gate.service';
import { PositionReaderService } from '../../positions/services/position-reader.service';
import { PortfolioWatchLogService } from '../services/portfolio-watch-log.service';
import { PortfolioWatchPublisherService } from '../services/portfolio-watch-publisher.service';
import { ChangeItem, ChangesFeed, ChangesQuery, MAX_CHANGES_ITEMS } from '../domain/portfolio-changes.types';
import { FeatureLockedError } from '../domain/portfolio-watch.errors';
import { PortfolioChangesReaderService } from '../services/portfolio-changes-reader.service';
import { PortfolioChangesApplication } from './portfolio-changes.application';

const QUERY: ChangesQuery = { days: 7, classId: null, holder: { kind: 'any' } };

const NOW: Date = new Date('2026-12-07T11:00:00Z');

function item(index: number, relevance: number | null = 1): ChangeItem {
    return {
        id: String(index),
        assetId: 'a',
        symbol: 'AAAA3',
        source: 'cvm_ipe',
        category: 'relevant_fact',
        title: 'T',
        kind: null,
        date: '2026-12-01',
        summary: 'x',
        summaryAvailable: true,
        relevance,
        weightBps: 100,
        weightLine: null,
        documentUrl: 'https://example.com'
    };
}

function build(plan: string, total: number, items: ChangeItem[] = []) {
    ContextHolder.set({
        get: () => ({}),
        run: (_context: unknown, fn: () => Promise<unknown>): Promise<unknown> => fn()
    } as unknown as AppContext);
    const feed: ChangesFeed = {
        days: 7,
        notice: 'n',
        items: items.length > 0 ? items : Array.from({ length: total }, (_unused: unknown, index: number) => item(index))
    };
    const read = vi.fn().mockResolvedValue(feed);
    const notify = vi.fn().mockResolvedValue({ sent: 1, skipped: 0 });
    const requestWeekly = vi.fn().mockResolvedValue(undefined);
    const application: PortfolioChangesApplication = new PortfolioChangesApplication(
        { read } as unknown as PortfolioChangesReaderService,
        { planOf: vi.fn().mockResolvedValue(plan) } as unknown as PlanGateService,
        { companyIdsWithRealPositions: vi.fn().mockResolvedValue(['c1', 'c2']) } as unknown as PositionReaderService,
        { notify } as unknown as NoticeService,
        { requestWeekly } as unknown as PortfolioWatchPublisherService,
        { weeklyFanOut: vi.fn(), weeklyEvaluated: vi.fn() } as unknown as PortfolioWatchLogService,
        { APP_URL: 'https://app.example.com' }
    );
    return { application, read, notify, requestWeekly };
}

describe('PortfolioChangesApplication', () => {
    it('plano Free recebe plan.feature_locked com a contagem de documentos e nenhum conteúdo', async () => {
        const error: unknown = await build('free', 4)
            .application.list(QUERY)
            .catch((caught: unknown): unknown => caught);

        expect(error).toBeInstanceOf(FeatureLockedError);
        expect(error).toMatchObject({ code: 'plan.feature_locked', status: 402, meta: { documentCount: 4 } });
    });

    it('Premium e auto-hospedado recebem o feed, no máximo o teto de itens', async () => {
        const premium: ChangesFeed = await build('premium', MAX_CHANGES_ITEMS + 5).application.list(QUERY);
        const selfHosted: ChangesFeed = await build('self_hosted', 2).application.list(QUERY);

        expect(premium.items).toHaveLength(MAX_CHANGES_ITEMS);
        expect(selfHosted.items).toHaveLength(2);
    });

    it('a varredura semanal pede uma avaliação por conta com posição, com a semana ISO no job', async () => {
        const { application, requestWeekly } = build('premium', 0);

        const total: number = await application.fanOutWeekly(NOW);

        expect(total).toBe(2);
        expect(requestWeekly).toHaveBeenCalledWith('c1', '2026-W50');
        expect(requestWeekly).toHaveBeenCalledWith('c2', '2026-W50');
    });

    it('manda o e-mail semanal só com documento de relevância 2 ou mais, no máximo cinco, na chave da semana', async () => {
        const items: ChangeItem[] = [
            item(1, 3),
            item(2, 1),
            item(3, null),
            ...Array.from({ length: 6 }, (_u: unknown, i: number) => item(10 + i, 2))
        ];
        const { application, notify, read } = build('premium', 0, items);

        const sent: number = await application.evaluateWeekly('c1', NOW);

        expect(sent).toBe(1);
        expect(read.mock.calls[0]?.[0]).toEqual({ days: 7, classId: null, holder: { kind: 'any' } });
        const request = notify.mock.calls[0]?.[1] as { type: string; key: string; props: Record<string, string> };
        expect(request.type).toBe('portfolio_weekly_changes');
        expect(request.key).toBe('portfolio_weekly_changes:2026-W50');
        expect(JSON.parse(request.props['items'] ?? '[]')).toHaveLength(5);
        expect(request.props['portfolioUrl']).toBe('https://app.example.com/portfolio');
    });

    it('sem documento de relevância 2 ou mais, ou em conta Free, não manda nada', async () => {
        const low = build('premium', 0, [item(1, 1), item(2, null)]);
        const free = build('free', 0, [item(1, 3)]);

        expect(await low.application.evaluateWeekly('c1', NOW)).toBe(0);
        expect(await free.application.evaluateWeekly('c1', NOW)).toBe(0);

        expect(low.notify).not.toHaveBeenCalled();
        expect(free.notify).not.toHaveBeenCalled();
        expect(free.read).not.toHaveBeenCalled();
    });
});
