import { describe, expect, it, vi } from 'vitest';
import { NoticeService } from '../../notices/services/notice.service';
import { PlanGateService } from '../../plans/services/plan-gate.service';
import { MonthlyReview } from '../validation/monthly-review.schemas';
import { MonthlyReviewAnnouncerService } from './monthly-review-announcer.service';
import { MonthlyReviewNarrativeService } from './monthly-review-narrative.service';
import { PortfolioWatchLogService } from './portfolio-watch-log.service';

const COMPANY: string = '0199b5b8-1c2d-7000-8000-000000000001';
const REVIEW = {
    month: '2026-10',
    baseCurrency: 'BRL',
    returnPct: 1.5,
    benchmarks: {
        cdi: { state: 'ok', returnPct: 1, referenceMonth: '2026-10' },
        ipca: { state: 'no_data', returnPct: null, referenceMonth: null },
        ibovespa: { state: 'not_configured', returnPct: null, referenceMonth: null }
    },
    income: { amountMinor: 5000, source: 'operations' }
} as unknown as MonthlyReview;

function make(plan: string, paragraphs: readonly string[] | null) {
    const notify = vi.fn().mockResolvedValue({ sent: 2, skipped: 0 });
    const paragraphsOf = vi.fn().mockResolvedValue(paragraphs);
    const logs = { reviewAnnounced: vi.fn() };
    const service: MonthlyReviewAnnouncerService = new MonthlyReviewAnnouncerService(
        { planOf: vi.fn().mockResolvedValue(plan) } as unknown as PlanGateService,
        { paragraphsOf } as unknown as MonthlyReviewNarrativeService,
        { notify } as unknown as NoticeService,
        logs as unknown as PortfolioWatchLogService,
        { APP_URL: 'https://app.example.com' }
    );
    return { service, notify, paragraphsOf, logs };
}

describe('MonthlyReviewAnnouncerService', () => {
    it('no plano grátis não escreve parágrafo nem manda e-mail', async () => {
        const { service, notify, paragraphsOf } = make('free', null);

        expect(await service.announce(COMPANY, REVIEW)).toBe(0);
        expect(paragraphsOf).not.toHaveBeenCalled();
        expect(notify).not.toHaveBeenCalled();
    });

    it('no Premium manda o aviso do mês, com a chave do mês, os números e o parágrafo', async () => {
        const { service, notify, logs } = make('premium', ['Rendeu **+1,50%**.']);

        expect(await service.announce(COMPANY, REVIEW)).toBe(2);
        expect(notify).toHaveBeenCalledTimes(1);
        const [companyId, request] = notify.mock.calls[0] as [string, { type: string; key: string; props: Record<string, string> }];
        expect(companyId).toBe(COMPANY);
        expect(request.type).toBe('portfolio_monthly_review');
        expect(request.key).toBe('portfolio_monthly_review:2026-10');
        expect(request.props).toEqual({
            month: '2026-10',
            currency: 'BRL',
            incomeMinor: '5000',
            reviewUrl: 'https://app.example.com/portfolio/review',
            returnPct: '1.5',
            cdiPct: '1',
            paragraphs: JSON.stringify(['Rendeu **+1,50%**.'])
        });
        expect(logs.reviewAnnounced).toHaveBeenCalledWith(true, 2);
    });

    it('sem permissão ou sem cota o e-mail sai só com os números', async () => {
        const { service, notify, logs } = make('premium', null);

        await service.announce(COMPANY, REVIEW);

        const request = (notify.mock.calls[0] as [string, { props: Record<string, string> }])[1];
        expect(request.props).not.toHaveProperty('paragraphs');
        expect(logs.reviewAnnounced).toHaveBeenCalledWith(false, 2);
    });
});
