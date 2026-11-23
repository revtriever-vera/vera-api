import { Injectable } from '@nestjs/common';
import { Page } from '../../../shared/pagination/pagination.types';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { DescriptionNormalizerService } from '../../spending-categories/services/description-normalizer.service';
import { firstDayOf, lastDayOf, monthOf } from '../domain/calendar';
import { TransactionDomain } from '../domain/transaction.domain';
import { Direction, TransactionFilter, TransactionTotals, TransactionView } from '../domain/transactions.types';
import { TransactionViewService } from '../services/transaction-view.service';

export interface ListPayload {
    readonly month?: string;
    readonly from?: string;
    readonly to?: string;
    readonly accountId?: string;
    readonly categoryId?: string;
    readonly uncategorized?: 'true' | 'false';
    readonly direction?: Direction;
    readonly q?: string;
    readonly page: number;
    readonly pageSize: number;
}

export interface TransactionListView extends Page<TransactionView> {
    readonly totals: TransactionTotals;
}

@Injectable()
export class TransactionListApplication {
    public constructor(
        private readonly transactions: TransactionDomain,
        private readonly timezone: CompanyTimezoneService,
        private readonly normalizer: DescriptionNormalizerService,
        private readonly views: TransactionViewService
    ) {}

    public async list(payload: ListPayload): Promise<TransactionListView> {
        const filter: TransactionFilter = await this.filterOf(payload);
        const [rows, totals] = await Promise.all([
            this.transactions.listPage(filter, payload.page, payload.pageSize),
            this.transactions.totals(filter)
        ]);
        return {
            data: await this.views.of(rows),
            pagination: {
                page: payload.page,
                pageSize: payload.pageSize,
                totalRecords: totals.count,
                totalPages: Math.ceil(totals.count / payload.pageSize)
            },
            totals
        };
    }

    public async uncategorizedCount(): Promise<{ count: number }> {
        return { count: await this.transactions.countUncategorizedOutgoing() };
    }

    private async filterOf(payload: ListPayload): Promise<TransactionFilter> {
        const hasRange: boolean = payload.from !== undefined && payload.to !== undefined;
        const month: string = payload.month ?? monthOf(await this.timezone.todayInCompany());
        return {
            fromDate: hasRange ? (payload.from as string) : firstDayOf(month),
            toDate: hasRange ? (payload.to as string) : lastDayOf(month),
            accountId: payload.accountId,
            categoryId: payload.categoryId,
            uncategorized: payload.uncategorized === 'true',
            direction: payload.direction,
            search: payload.q === undefined ? undefined : this.searchOf(payload.q)
        };
    }

    private searchOf(text: string): string {
        const normalized: string = this.normalizer.normalize(text);
        return normalized.length > 0 ? normalized : text.trim();
    }
}
