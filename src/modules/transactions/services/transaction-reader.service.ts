import { Injectable } from '@nestjs/common';
import { FinancialAccountDomain } from '../domain/financial-account.domain';
import { ExportCursor, TransactionDomain } from '../domain/transaction.domain';
import { toCategoryOrigin, toDateString, toSource } from '../domain/transaction.mapper';
import { EXPORT_PAGE_SIZE, ExportTransaction, FinancialAccount, Transaction, TransactionFilter } from '../domain/transactions.types';

export type { ExportTransaction, TransactionFilter };

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
            const last: Transaction | undefined = rows[rows.length - 1];
            const cursor: ExportCursor | null = last === undefined ? null : { date: toDateString(last.date), id: last.id };
            rows = rows.length < EXPORT_PAGE_SIZE ? [] : await this.transactions.listAfter(filter, cursor, EXPORT_PAGE_SIZE);
        }
    }

    private async toExport(rows: readonly Transaction[]): Promise<ExportTransaction[]> {
        const accountIds: string[] = [...new Set<string>(rows.map((row: Transaction): string => row.accountId))];
        const accounts: FinancialAccount[] = await this.accounts.findByIds(accountIds);
        const names: Map<string, string> = new Map<string, string>(
            accounts.map((account: FinancialAccount): [string, string] => [account.id, account.name])
        );
        return rows.map((row: Transaction): ExportTransaction => ({
            id: row.id,
            accountId: row.accountId,
            accountName: names.get(row.accountId) ?? '',
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
