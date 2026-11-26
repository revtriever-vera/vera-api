import { describe, expect, it, vi } from 'vitest';
import { CvmDailyInformeReaderService } from '../../catalog/services/cvm-daily-informe-reader.service';
import { FundCoverageDomain } from '../domain/fund-coverage.domain';
import { FundQuotePointDomain } from '../domain/fund-quote-point.domain';
import { FundCoverage } from '../domain/market-data.types';
import { FundQuoteHistoryService } from './fund-quote-history.service';
import { MarketDataLogService } from './market-data-log.service';
import { ProviderBudgetService } from './provider-budget.service';

const FUND = { assetId: 'asset-1', seriesKey: '11111111000191' };
const NOW = new Date('2026-03-20T15:00:00Z');

interface Rig {
    readonly service: FundQuoteHistoryService;
    readonly saved: ReturnType<typeof vi.fn>;
    readonly coverageSaved: ReturnType<typeof vi.fn>;
    readonly touch: ReturnType<typeof vi.fn>;
    readonly monthPoints: ReturnType<typeof vi.fn>;
    readonly reserve: ReturnType<typeof vi.fn>;
    readonly logs: { fundHistoryFailed: ReturnType<typeof vi.fn>; fundHistoryPruned: ReturnType<typeof vi.fn> };
}

function rig(coverage: FundCoverage | null, options: { budget?: boolean; failMonth?: string } = {}): Rig {
    const saved = vi.fn().mockResolvedValue(undefined);
    const coverageSaved = vi.fn().mockResolvedValue(undefined);
    const touch = vi.fn().mockResolvedValue(undefined);
    const reserve = vi.fn().mockResolvedValue(options.budget ?? true);
    const monthPoints = vi.fn((month: string) =>
        month === options.failMonth
            ? Promise.reject(new Error('down'))
            : Promise.resolve([{ date: `${month.slice(0, 4)}-${month.slice(4)}-02`, quota: '1.5' }])
    );
    const logs = { fundHistoryFailed: vi.fn(), fundHistoryPruned: vi.fn() };
    const service = new FundQuoteHistoryService(
        {
            save: saved,
            between: vi.fn().mockResolvedValue([{ date: '2026-03-02', quota: '1.5' }]),
            pruneBefore: vi.fn().mockResolvedValue(4),
            removeForAssets: vi.fn().mockResolvedValue(2)
        } as unknown as FundQuotePointDomain,
        {
            find: vi.fn().mockResolvedValue(coverage),
            save: coverageSaved,
            touch,
            trimBefore: vi.fn().mockResolvedValue(undefined),
            removeIdle: vi.fn().mockResolvedValue(['old-1'])
        } as unknown as FundCoverageDomain,
        { monthPoints } as unknown as CvmDailyInformeReaderService,
        { reserve } as unknown as ProviderBudgetService,
        logs as unknown as MarketDataLogService
    );
    return { service, saved, coverageSaved, touch, monthPoints, reserve, logs };
}

describe('FundQuoteHistoryService.history', () => {
    it('sem nada guardado baixa os meses pedidos dentro do orçamento, guarda os pontos e a cobertura', async () => {
        const { service, saved, coverageSaved, reserve, monthPoints } = rig(null);

        const history = await service.history(FUND, '2026-01-10', '2026-03-20', NOW);

        expect(reserve).toHaveBeenCalledWith('cvm', 3, NOW);
        expect(monthPoints.mock.calls.map((call) => call[0] as string)).toEqual(['202601', '202602', '202603']);
        expect(saved).toHaveBeenCalledWith('asset-1', expect.arrayContaining([{ date: '2026-01-02', quota: '1.5' }]), NOW);
        expect(coverageSaved).toHaveBeenCalledWith('asset-1', { coveredFrom: '2026-01-01', coveredTo: '2026-03-20' }, NOW);
        expect(history).toEqual({ points: [{ date: '2026-03-02', quota: '1.5' }], complete: true });
    });

    it('com tudo guardado só registra a leitura e não baixa nem gasta orçamento', async () => {
        const { service, touch, reserve, monthPoints, saved } = rig({ coveredFrom: '2026-01-01', coveredTo: '2026-03-20' });

        const history = await service.history(FUND, '2026-01-10', '2026-03-20', NOW);

        expect(reserve).not.toHaveBeenCalled();
        expect(monthPoints).not.toHaveBeenCalled();
        expect(saved).not.toHaveBeenCalled();
        expect(touch).toHaveBeenCalledWith('asset-1', NOW);
        expect(history.complete).toBe(true);
    });

    it('janela mais longa baixa só os meses anteriores e mantém o fim da cobertura', async () => {
        const { service, coverageSaved, monthPoints } = rig({ coveredFrom: '2026-01-01', coveredTo: '2026-03-20' });

        await service.history(FUND, '2025-11-05', '2026-03-20', NOW);

        expect(monthPoints.mock.calls.map((call) => call[0] as string)).toEqual(['202511', '202512']);
        expect(coverageSaved).toHaveBeenCalledWith('asset-1', { coveredFrom: '2025-11-01', coveredTo: '2026-03-20' }, NOW);
    });

    it('orçamento recusado devolve só o que já está guardado, marcado como incompleto', async () => {
        const { service, monthPoints, coverageSaved, touch } = rig(null, { budget: false });

        const history = await service.history(FUND, '2026-01-10', '2026-03-20', NOW);

        expect(monthPoints).not.toHaveBeenCalled();
        expect(coverageSaved).not.toHaveBeenCalled();
        expect(touch).toHaveBeenCalled();
        expect(history.complete).toBe(false);
    });

    it('falha num mês guarda o que veio, não grava a cobertura e avisa que está incompleto', async () => {
        const { service, saved, coverageSaved, logs } = rig(null, { failMonth: '202602' });

        const history = await service.history(FUND, '2026-01-10', '2026-03-20', NOW);

        expect(saved).toHaveBeenCalledWith('asset-1', [{ date: '2026-01-02', quota: '1.5' }], NOW);
        expect(coverageSaved).not.toHaveBeenCalled();
        expect(logs.fundHistoryFailed).toHaveBeenCalledWith('202602', expect.any(Error));
        expect(history.complete).toBe(false);
    });
});

describe('FundQuoteHistoryService.pruneHistory', () => {
    it('apaga pontos além da retenção e os fundos sem leitura há muito tempo, e registra quanto', async () => {
        const { service, logs } = rig(null);

        await service.pruneHistory(NOW);

        expect(logs.fundHistoryPruned).toHaveBeenCalledWith(6, 1);
    });
});
