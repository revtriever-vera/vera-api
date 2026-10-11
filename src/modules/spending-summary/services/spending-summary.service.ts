import { Injectable } from '@nestjs/common';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { CategoryReaderService, SpendingCategory } from '../../spending-categories/services/category-reader.service';
import { MonthlyCategoryNet, TransactionAggregatesService } from '../../transactions/services/transaction-aggregates.service';
import { addMonths, isPartialMonth, monthOfDate, nextMonthOf, previousMonthOf, resolveMonth } from '../domain/month';
import { calculateSummary } from '../domain/summary-calculator';
import {
    AVERAGE_WINDOW_MONTHS,
    CategoryInfo,
    FIRST_SUPPORTED_MONTH,
    MonthlySummary,
    SpendingSettingsView,
    SummaryInput
} from '../domain/spending-summary.types';
import { SpendingSettingsReaderService } from './spending-settings-reader.service';
import { SpendingSummaryLogService } from './spending-summary-log.service';
import { SpendingSummaryMetricsService } from './spending-summary-metrics.service';

export type { MonthlySummary };

type LoadedData = [readonly MonthlyCategoryNet[], readonly string[], readonly SpendingCategory[], SpendingSettingsView, number];

function infoOf(category: SpendingCategory): CategoryInfo {
    return {
        id: category.id,
        systemKey: category.systemKey,
        name: category.name,
        icon: category.icon,
        kind: category.kind,
        flexibility: category.flexibility,
        position: category.position
    };
}

@Injectable()
export class SpendingSummaryService {
    public constructor(
        private readonly timezones: CompanyTimezoneService,
        private readonly aggregates: TransactionAggregatesService,
        private readonly categories: CategoryReaderService,
        private readonly settings: SpendingSettingsReaderService,
        private readonly logs: SpendingSummaryLogService,
        private readonly metrics: SpendingSummaryMetricsService
    ) {}

    public async build(requestedMonth: string | null): Promise<MonthlySummary> {
        const startedAt: number = Date.now();
        const today: string = await this.timezones.todayInCompany();
        const month: string = resolveMonth(requestedMonth, today);
        const summary: MonthlySummary = calculateSummary(await this.inputFor(month, today));
        const durationMs: number = Date.now() - startedAt;
        this.logs.summaryBuilt(month, summary.isPartial, summary.categories.length, durationMs);
        this.metrics.summaryDuration(durationMs);
        return summary;
    }

    private async inputFor(month: string, today: string): Promise<SummaryInput> {
        const [nets, monthsWithData, categories, settings, excluded]: LoadedData = await this.load(month, today);
        return {
            month,
            isPartial: isPartialMonth(month, today),
            nets,
            monthsWithData,
            categories: categories.map(infoOf),
            settings,
            excludedCurrencyCount: excluded,
            navigation: { previousMonth: previousMonthOf(month), nextMonth: nextMonthOf(month, today) }
        };
    }

    private async load(month: string, today: string): Promise<LoadedData> {
        return Promise.all([
            this.aggregates.monthlyNetByCategory({ fromMonth: addMonths(month, -AVERAGE_WINDOW_MONTHS), toMonth: month }),
            this.aggregates.monthsWithData({ fromMonth: FIRST_SUPPORTED_MONTH, toMonth: monthOfDate(today) }),
            this.categories.listForCompany(),
            this.settings.get(),
            this.aggregates.excludedCurrencyCount(month)
        ]);
    }
}
