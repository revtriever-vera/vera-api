import { Injectable } from '@nestjs/common';
import { FinancialAccountDomain } from '../domain/financial-account.domain';
import { ExportCursor, TransactionDomain } from '../domain/transaction.domain';
import { toCategoryOrigin, toDateString, toSource } from '../domain/transaction.mapper';
import {
    EXPORT_PAGE_SIZE,
    ExportTransaction,
    FinancialAccount,
    RecurrenceTransaction,
    Transaction,
    TransactionFilter
} from '../domain/transactions.types';

export type { ExportTransaction, RecurrenceTransaction, TransactionFilter };

function toRecurrenceTransaction(row: Transaction): RecurrenceTransaction {
    return {
        id: row.id,
        accountId: row.accountId,
        date: toDateString(row.date),
        amountMinor: Number(row.amountMinor),
        currency: row.currency,
        description: row.description,
        normalizedDescription: row.normalizedDescription,
        counterpartyName: row.counterpartyName,
        counterpartyKey: row.counterpartyKey,
        categoryId: row.categoryId,
        categorySource: toCategoryOrigin(row.categorySource),
        installmentTotal: row.installmentTotal,
        isSample: row.isSample
    };
}

@Injectable()
export class TransactionReaderService {
    public constructor(
        private readonly transactions: TransactionDomain,
        private readonly accounts: FinancialAccountDomain
    ) {}

    public async *pagesForExport(filter: TransactionFilter): AsyncIterable<readonly ExportTransaction[]> {
        let rows: Transaction[] = await this.transactions.listAfter(filter, null, EXPORT_PAGE_SIZE);
        while (rows.length > 0) {
            yield await this.toExport(rows);
            const last: Transaction | undefined = rows.at(-1);
            const cursor: ExportCursor | null = last === undefined ? null : { date: toDateString(last.date), id: last.id };
            rows = rows.length < EXPORT_PAGE_SIZE ? [] : await this.transactions.listAfter(filter, cursor, EXPORT_PAGE_SIZE);
        }
    }

    public async *pagesForRecurrence(fromDate: string, toDate: string): AsyncIterable<readonly RecurrenceTransaction[]> {
        const filter: TransactionFilter = { fromDate, toDate };
        let rows: Transaction[] = await this.transactions.listAfter(filter, null, EXPORT_PAGE_SIZE);
        while (rows.length > 0) {
            yield rows.map(toRecurrenceTransaction);
            const last: Transaction | undefined = rows.at(-1);
            const cursor: ExportCursor | null = last === undefined ? null : { date: toDateString(last.date), id: last.id };
            rows = rows.length < EXPORT_PAGE_SIZE ? [] : await this.transactions.listAfter(filter, cursor, EXPORT_PAGE_SIZE);
        }
    }

    public async findForRecurrence(ids: readonly string[]): Promise<RecurrenceTransaction[]> {
        return (await this.transactions.listByIds(ids)).map(toRecurrenceTransaction);
    }

    public async countForExport(filter: TransactionFilter): Promise<number> {
        return (await this.transactions.totals(filter)).count;
    }

    private async toExport(rows: readonly Transaction[]): Promise<ExportTransaction[]> {
        const accountIds: string[] = [...new Set<string>(rows.map((row: Transaction): string => row.accountId))];
        const accounts: FinancialAccount[] = await this.accounts.findByIds(accountIds);
        const byId: Map<string, FinancialAccount> = new Map<string, FinancialAccount>(
            accounts.map((account: FinancialAccount): [string, FinancialAccount] => [account.id, account])
        );
        return rows.map((row: Transaction): ExportTransaction => ({
            id: row.id,
            accountId: row.accountId,
            accountName: byId.get(row.accountId)?.name ?? '',
            institutionName: byId.get(row.accountId)?.institutionName ?? null,
            date: toDateString(row.date),
            amountMinor: Number(row.amountMinor),
            currency: row.currency,
            description: row.description,
            counterpartyName: row.counterpartyName,
            categoryId: row.categoryId,
            categorySource: toCategoryOrigin(row.categorySource),
            source: toSource(row.source)
        }));
    }
}
