import { describe, expect, it, vi } from 'vitest';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { CategoryReaderService } from '../../spending-categories/services/category-reader.service';
import { TransactionAggregatesService } from '../../transactions/services/transaction-aggregates.service';
import { InvalidSummaryMonthError } from '../domain/spending-summary.errors';
import { SpendingSettingsReaderService } from './spending-settings-reader.service';
import { SpendingSummaryLogService } from './spending-summary-log.service';
import { SpendingSummaryMetricsService } from './spending-summary-metrics.service';
import { SpendingSummaryService } from './spending-summary.service';

function category(id: string, systemKey: string, kind: string, flexibility: string | null, position: number): Record<string, unknown> {
    return { id, systemKey, name: null, icon: 'Home', kind, flexibility, position };
}

function build(today: string = '2026-10-11') {
    const monthlyNetByCategory = vi.fn().mockResolvedValue([
        { month: '2026-08', categoryId: 'c-leisure', netMinor: -10000, outflowMinor: -10000, outflowCount: 1, transactionCount: 1 },
        { month: '2026-09', categoryId: 'c-leisure', netMinor: -15000, outflowMinor: -15000, outflowCount: 1, transactionCount: 1 },
        { month: '2026-09', categoryId: 'c-income', netMinor: 100000, outflowMinor: 0, outflowCount: 0, transactionCount: 1 }
    ]);
    const monthsWithData = vi.fn().mockResolvedValue(['2026-08', '2026-09']);
    const excludedCurrencyCount = vi.fn().mockResolvedValue(2);
    const summaryBuilt = vi.fn();
    const summaryDuration = vi.fn();
    const service = new SpendingSummaryService(
        { todayInCompany: vi.fn().mockResolvedValue(today) } as unknown as CompanyTimezoneService,
        { monthlyNetByCategory, monthsWithData, excludedCurrencyCount } as unknown as TransactionAggregatesService,
        {
            listForCompany: vi
                .fn()
                .mockResolvedValue([
                    category('c-leisure', 'leisure', 'expense', 'flexible', 9),
                    category('c-income', 'income', 'income', null, 13)
                ])
        } as unknown as CategoryReaderService,
        {
            get: vi.fn().mockResolvedValue({ savingsGoalBps: 2000, incomeMode: 'transactions', declaredIncomeMinor: null })
        } as unknown as SpendingSettingsReaderService,
        { summaryBuilt } as unknown as SpendingSummaryLogService,
        { summaryDuration } as unknown as SpendingSummaryMetricsService
    );
    return { service, monthlyNetByCategory, monthsWithData, excludedCurrencyCount, summaryBuilt, summaryDuration };
}

describe('SpendingSummaryService', () => {
    it('sem parâmetro monta o último mês fechado com uma só leitura agregada', async () => {
        const { service, monthlyNetByCategory, monthsWithData, excludedCurrencyCount } = build();

        const summary = await service.build(null);

        expect(summary).toMatchObject({
            month: '2026-09',
            isPartial: false,
            previousMonth: '2026-08',
            nextMonth: '2026-10',
            excludedCurrencyCount: 2
        });
        expect(summary.categories[0]).toMatchObject({ systemKey: 'leisure', spentMinor: 15000, averageMinor: 10000, deltaBps: 5000 });
        expect(summary.income.minor).toBe(100000);
        expect(monthlyNetByCategory).toHaveBeenCalledTimes(1);
        expect(monthlyNetByCategory).toHaveBeenCalledWith({ fromMonth: '2026-06', toMonth: '2026-09' });
        expect(monthsWithData).toHaveBeenCalledTimes(1);
        expect(monthsWithData).toHaveBeenCalledWith({ fromMonth: '2000-01', toMonth: '2026-10' });
        expect(excludedCurrencyCount).toHaveBeenCalledWith('2026-09');
    });

    it('o mês corrente é parcial e não tem próximo', async () => {
        const { service } = build();

        const summary = await service.build('2026-10');

        expect(summary).toMatchObject({ month: '2026-10', isPartial: true, nextMonth: null, previousMonth: '2026-09' });
    });

    it('mês futuro é inválido e nada é consultado', async () => {
        const { service, monthlyNetByCategory } = build();

        await expect(service.build('2026-11')).rejects.toBeInstanceOf(InvalidSummaryMonthError);
        expect(monthlyNetByCategory).not.toHaveBeenCalled();
    });

    it('registra log e métrica sem valores', async () => {
        const { service, summaryBuilt, summaryDuration } = build();

        await service.build(null);

        expect(summaryBuilt).toHaveBeenCalledWith('2026-09', false, 1, expect.any(Number));
        expect(summaryDuration).toHaveBeenCalledWith(expect.any(Number));
    });
});
