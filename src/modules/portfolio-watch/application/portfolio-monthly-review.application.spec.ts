import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../../core/context/app-context.port';
import { ContextHolder } from '../../../core/context/as-company.decorator';
import { FixedIncomeCompaniesService } from '../../fixed-income/services/fixed-income-companies.service';
import { PositionReaderService } from '../../positions/services/position-reader.service';
import { MonthlyReviewDomain } from '../domain/monthly-review.domain';
import { MonthlyReviewNotFoundError } from '../domain/portfolio-watch.errors';
import { MonthlyReviewAnnouncerService } from '../services/monthly-review-announcer.service';
import { MonthlyReviewNarrativeService } from '../services/monthly-review-narrative.service';
import { MonthlyReviewService } from '../services/monthly-review.service';
import { PortfolioWatchLogService } from '../services/portfolio-watch-log.service';
import { PortfolioWatchPublisherService } from '../services/portfolio-watch-publisher.service';
import { PortfolioMonthlyReviewApplication } from './portfolio-monthly-review.application';

const COMPANY: string = '0199b5b8-1c2d-7000-8000-000000000001';
const OTHER: string = '0199b5b8-1c2d-7000-8000-000000000002';

const REVIEW = {
    month: '2026-10',
    baseCurrency: 'BRL',
    returnPct: 1.5,
    byClass: [],
    benchmarks: {
        cdi: { state: 'ok', returnPct: 1, referenceMonth: '2026-10' },
        ipca: { state: 'no_data', returnPct: null, referenceMonth: null },
        ibovespa: { state: 'not_configured', returnPct: null, referenceMonth: null }
    },
    topGainers: [],
    topLosers: [],
    income: { amountMinor: 0, source: 'ledger' },
    concentration: { topIssuers: [], sectors: [], fgcExposure: { overLimitMinor: 0, groups: [] } },
    coverage: { reason: null, message: null, generatedAt: '2026-11-01T08:00:00.000Z' }
};

function make(overrides: { build?: unknown; record?: unknown; find?: unknown; list?: unknown } = {}) {
    ContextHolder.set({ get: () => ({}), run: (_context: unknown, fn: () => Promise<unknown>) => fn() } as unknown as AppContext);
    const publisher = { requestMonthlyReview: vi.fn().mockResolvedValue(undefined) };
    const reviews = { build: vi.fn().mockResolvedValue(overrides.build ?? REVIEW) };
    const stored = {
        record: vi.fn().mockResolvedValue(overrides.record ?? true),
        find: vi.fn().mockResolvedValue('find' in overrides ? overrides.find : { payload: REVIEW }),
        listRecent: vi.fn().mockResolvedValue(overrides.list ?? [])
    };
    const logs = { reviewFanOut: vi.fn(), reviewSaved: vi.fn() };
    const announcer = { announce: vi.fn().mockResolvedValue(1) };
    const narrative = {
        storedOf: vi.fn().mockResolvedValue('Texto.')
    };
    const application = new PortfolioMonthlyReviewApplication(
        { companyIdsWithRealPositions: vi.fn().mockResolvedValue([COMPANY]) } as unknown as PositionReaderService,
        { companyIdsWithRealTitles: vi.fn().mockResolvedValue([COMPANY, OTHER]) } as unknown as FixedIncomeCompaniesService,
        reviews as unknown as MonthlyReviewService,
        stored as unknown as MonthlyReviewDomain,
        publisher as unknown as PortfolioWatchPublisherService,
        announcer as unknown as MonthlyReviewAnnouncerService,
        narrative as unknown as MonthlyReviewNarrativeService,
        logs as unknown as PortfolioWatchLogService
    );
    return { application, publisher, reviews, stored, announcer, narrative };
}

describe('revisão mensal', () => {
    it('no dia 1 pede a revisão do mês que fechou, uma vez por empresa com carteira', async () => {
        const { application, publisher } = make();

        const asked: number = await application.fanOutMonthly(new Date('2026-11-01T08:00:00Z'));

        expect(asked).toBe(2);
        expect(publisher.requestMonthlyReview).toHaveBeenCalledWith(COMPANY, '2026-10');
        expect(publisher.requestMonthlyReview).toHaveBeenCalledWith(OTHER, '2026-10');
    });

    it('guarda a revisão pronta e diz se gravou ou se já existia', async () => {
        const { application, stored } = make({ record: false });

        const recorded: boolean = await application.reviewCompany(COMPANY, '2026-10');

        expect(recorded).toBe(false);
        expect(stored.record).toHaveBeenCalledWith('2026-10', REVIEW);
    });

    it('depois de guardar, entrega a revisão guardada ao aviso, inclusive numa nova tentativa em que já existia', async () => {
        const { application, announcer } = make({ record: false });

        await application.reviewCompany(COMPANY, '2026-10');

        expect(announcer.announce).toHaveBeenCalledWith(COMPANY, REVIEW);
    });

    it('sem foto completa no fim do mês não grava nem avisa', async () => {
        const { application, stored, reviews, announcer } = make();
        reviews.build.mockResolvedValue(null);

        expect(await application.reviewCompany(COMPANY, '2026-10')).toBe(false);
        expect(stored.record).not.toHaveBeenCalled();
        expect(announcer.announce).not.toHaveBeenCalled();
    });

    it('a revisão sai com o parágrafo que o texto guardado devolver, nulo quando não há', async () => {
        const withText = make();
        const without = make();
        without.narrative.storedOf.mockResolvedValue(null);

        expect((await withText.application.getWithSummary('2026-10')).summary).toBe('Texto.');
        expect((await without.application.getWithSummary('2026-10')).summary).toBeNull();
    });

    it('mês sem revisão é 404', async () => {
        const { application } = make({ find: null });

        await expect(application.get('2026-09')).rejects.toBeInstanceOf(MonthlyReviewNotFoundError);
    });

    it('devolve a revisão guardada e lista os meses com a rentabilidade de cada um', async () => {
        const { application } = make({
            find: { payload: REVIEW },
            list: [
                { month: '2026-10', payload: REVIEW },
                { month: '2026-09', payload: { ...REVIEW, returnPct: undefined } }
            ]
        });

        expect((await application.get('2026-10')).returnPct).toBe(1.5);
        expect(await application.list()).toEqual({
            items: [
                { month: '2026-10', returnPct: 1.5 },
                { month: '2026-09', returnPct: null }
            ]
        });
    });
});
