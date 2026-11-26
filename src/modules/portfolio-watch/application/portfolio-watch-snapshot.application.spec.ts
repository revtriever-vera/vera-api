import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../../core/context/app-context.port';
import { ContextHolder } from '../../../core/context/as-company.decorator';
import { FixedIncomeCompaniesService } from '../../fixed-income/services/fixed-income-companies.service';
import { PortfolioSnapshotService } from '../../portfolio/services/portfolio-snapshot.service';
import { PositionReaderService } from '../../positions/services/position-reader.service';
import { PortfolioMonthlySnapshotDomain } from '../domain/portfolio-monthly-snapshot.domain';
import { PortfolioWatchLogService } from '../services/portfolio-watch-log.service';
import { PortfolioWatchPublisherService } from '../services/portfolio-watch-publisher.service';
import { PortfolioWatchSnapshotApplication } from './portfolio-watch-snapshot.application';

const NOW: Date = new Date('2026-12-01T07:00:00Z');

function build(holdings: unknown[]) {
    ContextHolder.set({
        get: () => ({}),
        run: (_context: unknown, fn: () => Promise<unknown>) => fn()
    } as unknown as AppContext);
    const requestMonthlySnapshot = vi.fn().mockResolvedValue(undefined);
    const snapshotSkippedMissingQuotes = vi.fn();
    const saveMonth = vi.fn().mockResolvedValue(undefined);
    const application = new PortfolioWatchSnapshotApplication(
        { companyIdsWithRealPositions: vi.fn().mockResolvedValue(['c1', 'c2']) } as unknown as PositionReaderService,
        { companyIdsWithRealTitles: vi.fn().mockResolvedValue(['c2', 'c3']) } as unknown as FixedIncomeCompaniesService,
        { build: vi.fn().mockResolvedValue({ baseCurrency: 'BRL', holdings }) } as unknown as PortfolioSnapshotService,
        { saveMonth } as unknown as PortfolioMonthlySnapshotDomain,
        { requestMonthlySnapshot } as unknown as PortfolioWatchPublisherService,
        { snapshotFanOut: vi.fn(), snapshotSaved: vi.fn(), snapshotSkippedMissingQuotes } as unknown as PortfolioWatchLogService
    );
    return { application, requestMonthlySnapshot, saveMonth, snapshotSkippedMissingQuotes };
}

describe('PortfolioWatchSnapshotApplication', () => {
    it('a varredura pede uma foto por conta com posição ou título, sem repetir, com o mês', async () => {
        const { application, requestMonthlySnapshot } = build([]);

        const total: number = await application.fanOutMonthly(NOW);

        expect(total).toBe(3);
        expect(requestMonthlySnapshot.mock.calls).toEqual([
            ['c1', '2026-12'],
            ['c2', '2026-12'],
            ['c3', '2026-12']
        ]);
    });

    it('grava a foto do mês da conta', async () => {
        const { application, saveMonth } = build([
            {
                kind: 'position',
                id: 'p',
                assetId: 'a1',
                classId: 'k',
                quantity: '1',
                unitPrice: '2',
                priceDate: '2026-12-01',
                valueMinor: 200,
                isSample: false,
                isZeroQuantity: false
            }
        ]);

        expect(await application.snapshotCompany('c1', NOW)).toBe(1);
        expect(saveMonth).toHaveBeenCalledWith('2026-12', [expect.objectContaining({ assetId: 'a1', valueMinor: 200 })]);
    });

    it('carteira vazia não grava', async () => {
        const { application, saveMonth } = build([]);

        expect(await application.snapshotCompany('c1', NOW)).toBe(0);
        expect(saveMonth).not.toHaveBeenCalled();
    });

    it('não grava a foto quando algum ativo está sem cotação', async () => {
        const holding = (id: string, missingQuote: boolean) => ({
            kind: 'position',
            id,
            assetId: id,
            classId: 'k',
            quantity: '1',
            unitPrice: missingQuote ? null : '2',
            priceDate: null,
            valueMinor: missingQuote ? 0 : 200,
            missingQuote,
            isSample: false,
            isZeroQuantity: false
        });
        const { application, saveMonth, snapshotSkippedMissingQuotes } = build([holding('a1', false), holding('a2', true)]);

        expect(await application.snapshotCompany('c1', NOW)).toBe(0);
        expect(saveMonth).not.toHaveBeenCalled();
        expect(snapshotSkippedMissingQuotes).toHaveBeenCalledWith('2026-12', 1);
    });
});
