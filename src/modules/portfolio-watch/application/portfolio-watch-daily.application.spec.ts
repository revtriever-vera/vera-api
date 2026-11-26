import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../../core/context/app-context.port';
import { ContextHolder } from '../../../core/context/as-company.decorator';
import { FixedIncomeCompaniesService } from '../../fixed-income/services/fixed-income-companies.service';
import { DigestRequest, NoticeService } from '../../notices/services/notice.service';
import { PositionReaderService } from '../../positions/services/position-reader.service';
import { AgendaItem } from '../domain/portfolio-agenda.types';
import { PortfolioAgendaService } from '../services/portfolio-agenda.service';
import { PortfolioIncomeLedgerService } from '../services/portfolio-income-ledger.service';
import { PortfolioWatchLogService } from '../services/portfolio-watch-log.service';
import { PortfolioWatchPublisherService } from '../services/portfolio-watch-publisher.service';
import { PortfolioWatchDailyApplication } from './portfolio-watch-daily.application';

const NOW: Date = new Date('2026-12-01T12:00:00Z');

function item(overrides: Partial<AgendaItem>): AgendaItem {
    return {
        id: 'e1',
        kind: 'fii_income',
        assetId: 'a1',
        holdingId: null,
        name: 'XPLG11',
        date: '2026-12-01',
        exDate: null,
        paymentDate: null,
        eventDate: null,
        amountPerUnit: '0.78',
        currency: 'BRL',
        amountForAccountMinor: 7800,
        estimated: true,
        documentUrl: null,
        ...overrides
    };
}

function build(items: AgendaItem[]) {
    ContextHolder.set({
        get: () => ({}),
        run: (_context: unknown, fn: () => Promise<unknown>): Promise<unknown> => fn()
    } as unknown as AppContext);
    const requestDaily = vi.fn().mockResolvedValue(undefined);
    const notifyDigest = vi
        .fn<(companyId: string, request: DigestRequest) => Promise<{ sent: number; skipped: number }>>()
        .mockResolvedValue({ sent: 1, skipped: 0 });
    const recordEvent = vi.fn().mockResolvedValue(true);
    const buildAgenda = vi.fn().mockResolvedValue(items);
    const application = new PortfolioWatchDailyApplication(
        { companyIdsWithRealPositions: vi.fn().mockResolvedValue(['c1', 'c2']) } as unknown as PositionReaderService,
        { companyIdsWithRealTitles: vi.fn().mockResolvedValue(['c2', 'c3']) } as unknown as FixedIncomeCompaniesService,
        { build: buildAgenda } as unknown as PortfolioAgendaService,
        { recordEvent } as unknown as PortfolioIncomeLedgerService,
        { notifyDigest } as unknown as NoticeService,
        { requestDaily } as unknown as PortfolioWatchPublisherService,
        { dailyFanOut: vi.fn(), dailyEvaluated: vi.fn() } as unknown as PortfolioWatchLogService
    );
    return { application, requestDaily, notifyDigest, recordEvent, buildAgenda };
}

describe('PortfolioWatchDailyApplication', () => {
    it('a varredura pede uma avaliação por conta com carteira, sem repetir a conta que tem posição e título', async () => {
        const { application, requestDaily } = build([]);

        const total: number = await application.fanOutDaily(NOW);

        expect(total).toBe(3);
        expect(requestDaily.mock.calls.map((call: unknown[]): unknown => call[0])).toEqual(['c1', 'c2', 'c3']);
        expect(requestDaily).toHaveBeenCalledWith('c1', '2026-12-01');
    });

    it('lê a agenda de hoje até daqui a 15 dias e manda um resumo só com os avisos do dia', async () => {
        const { application, notifyDigest, buildAgenda } = build([
            item({ exDate: '2026-12-02' }),
            item({ id: 'e2', exDate: '2026-12-10' })
        ]);

        const sent: number = await application.evaluate('c1', NOW);

        expect(sent).toBe(1);
        expect(buildAgenda.mock.calls[0]?.[0]).toEqual({ from: '2026-12-01', to: '2026-12-16' });
        const request = notifyDigest.mock.calls[0]?.[1] as DigestRequest;
        expect(notifyDigest.mock.calls[0]?.[0]).toBe('c1');
        expect(request.entries).toHaveLength(1);
        expect(request.entries[0]?.type).toBe('portfolio_ex_date_tomorrow');
    });

    it('não manda nada quando o dia não tem aviso', async () => {
        const { application, notifyDigest } = build([item({ exDate: '2026-12-10' })]);

        expect(await application.evaluate('c1', NOW)).toBe(0);
        expect(notifyDigest).not.toHaveBeenCalled();
    });

    it('grava no livro de proventos o que tem data-com hoje, e só proventos com valor', async () => {
        const { application, recordEvent } = build([
            item({ id: 'a', exDate: '2026-12-01', paymentDate: '2026-12-14' }),
            item({ id: 'b', exDate: '2026-12-01', amountPerUnit: null }),
            item({ id: 'c', kind: 'assembly', exDate: '2026-12-01' }),
            item({ id: 'd', exDate: '2026-12-02' })
        ]);

        await application.evaluate('c1', NOW);

        expect(recordEvent).toHaveBeenCalledTimes(1);
        expect(recordEvent).toHaveBeenCalledWith('c1', {
            eventId: 'a',
            assetId: 'a1',
            amountPerUnit: '0.78',
            currency: 'BRL',
            paymentDate: '2026-12-14'
        });
    });
});
