import { Injectable } from '@nestjs/common';
import { FinancialAccountDomain } from '../domain/financial-account.domain';
import { toTransactionView } from '../domain/transaction.mapper';
import { FinancialAccount, Transaction, TransactionView } from '../domain/transactions.types';
import { TransactionsRecurringService } from './transactions-recurring.service';

@Injectable()
export class TransactionViewService {
    public constructor(
        private readonly accounts: FinancialAccountDomain,
        private readonly recurring: TransactionsRecurringService
    ) {}

    public async of(rows: readonly Transaction[]): Promise<TransactionView[]> {
        const ids: string[] = [...new Set<string>(rows.map((row: Transaction): string => row.accountId))];
        const accounts: FinancialAccount[] = ids.length === 0 ? [] : await this.accounts.findByIds(ids);
        const names: Map<string, string> = new Map<string, string>(
            accounts.map((account: FinancialAccount): [string, string] => [account.id, account.name])
        );
        const recurring: ReadonlySet<string> = await this.recurring.markedIn(rows.map((row: Transaction): string => row.id));
        return rows.map((row: Transaction): TransactionView =>
            toTransactionView(row, names.get(row.accountId) ?? '', recurring.has(row.id))
        );
    }
}
