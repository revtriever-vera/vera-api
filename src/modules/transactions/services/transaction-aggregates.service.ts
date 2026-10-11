import { Injectable } from '@nestjs/common';
import { TransactionDomain } from '../domain/transaction.domain';
import { MonthlyCategoryNet, MonthRange } from '../domain/transactions.types';

export type { MonthlyCategoryNet, MonthRange };

@Injectable()
export class TransactionAggregatesService {
    public constructor(private readonly transactions: TransactionDomain) {}

    public async monthlyNetByCategory(range: MonthRange): Promise<readonly MonthlyCategoryNet[]> {
        return this.transactions.monthlyNetByCategory(range);
    }

    public async monthsWithData(range: MonthRange): Promise<readonly string[]> {
        return this.transactions.monthsWithData(range);
    }

    public async excludedCurrencyCount(month: string): Promise<number> {
        return this.transactions.countOtherCurrencies(month);
    }
}
