import { describe, expect, it, vi } from 'vitest';
import { QueueEnvelope } from '../../../../core/queue/queue.types';
import { PortfolioMonthlyReviewApplication } from '../../application/portfolio-monthly-review.application';
import { PortfolioWatchMonthlyReviewTickHandler } from '../commands/portfolio-watch-monthly-review.command';
import { PortfolioWatchMonthlyReviewHandler } from './portfolio-watch-monthly-review.handler';

const COMPANY: string = '0199b5b8-1c2d-7000-8000-000000000001';

function envelope(payload: unknown): QueueEnvelope {
    return { type: 'x', requestId: 'r', companyId: null, occurredAt: '2026-11-01T08:00:00Z', trace: {}, payload };
}

describe('handlers da revisão mensal', () => {
    it('monta a revisão da empresa e do mês do payload', async () => {
        const reviewCompany = vi.fn().mockResolvedValue(true);

        await new PortfolioWatchMonthlyReviewHandler({ reviewCompany } as unknown as PortfolioMonthlyReviewApplication).handle(
            envelope({ companyId: COMPANY, month: '2026-10' })
        );

        expect(reviewCompany).toHaveBeenCalledWith(COMPANY, '2026-10');
    });

    it('payload inválido é descartado sem tentar de novo', async () => {
        const reviewCompany = vi.fn();

        await new PortfolioWatchMonthlyReviewHandler({ reviewCompany } as unknown as PortfolioMonthlyReviewApplication).handle(
            envelope({ companyId: COMPANY, month: '2026-13' })
        );

        expect(reviewCompany).not.toHaveBeenCalled();
    });

    it('o tick do dia 1 às 5h dispara a varredura', async () => {
        const fanOutMonthly = vi.fn().mockResolvedValue(0);

        await new PortfolioWatchMonthlyReviewTickHandler({ fanOutMonthly } as unknown as PortfolioMonthlyReviewApplication).handle(
            envelope({})
        );

        expect(fanOutMonthly).toHaveBeenCalledOnce();
    });
});
