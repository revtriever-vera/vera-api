import { Injectable } from '@nestjs/common';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { CategoryReaderService } from '../../spending-categories/services/category-reader.service';
import { TransactionAggregatesService } from '../../transactions/services/transaction-aggregates.service';
import { ExpenseAverage, expenseAverage } from '../domain/expense-average';
import { addMonths, monthOfDate } from '../domain/month';
import { AVERAGE_WINDOW_MONTHS, FIRST_SUPPORTED_MONTH } from '../domain/spending-summary.types';

export type { ExpenseAverage };

@Injectable()
export class SpendingExpenseAverageService {
    public constructor(
        private readonly timezones: CompanyTimezoneService,
        private readonly aggregates: TransactionAggregatesService,
        private readonly categories: CategoryReaderService
    ) {}

    public async trailing(): Promise<ExpenseAverage> {
        const current: string = monthOfDate(await this.timezones.todayInCompany());
        const [nets, monthsWithData, categories] = await Promise.all([
            this.aggregates.monthlyNetByCategory({
                fromMonth: addMonths(current, -AVERAGE_WINDOW_MONTHS),
                toMonth: addMonths(current, -1)
            }),
            this.aggregates.monthsWithData({ fromMonth: FIRST_SUPPORTED_MONTH, toMonth: current }),
            this.categories.listForCompany()
        ]);
        return expenseAverage(
            current,
            monthsWithData,
            nets,
            categories.map((category) => ({
                id: category.id,
                systemKey: category.systemKey,
                name: category.name,
                icon: category.icon,
                kind: category.kind,
                flexibility: category.flexibility,
                position: category.position
            }))
        );
    }
}
