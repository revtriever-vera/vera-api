import { Injectable } from '@nestjs/common';
import { FinancialAccountDomain } from '../domain/financial-account.domain';
import { TransactionDomain } from '../domain/transaction.domain';
import { toAccountView } from '../domain/transaction.mapper';
import { AccountStats, AccountView, FinancialAccount } from '../domain/transactions.types';
import { FinancialAccountService } from '../services/financial-account.service';

@Injectable()
export class AccountApplication {
    public constructor(
        private readonly accounts: FinancialAccountDomain,
        private readonly transactions: TransactionDomain,
        private readonly accountService: FinancialAccountService
    ) {}

    public async list(): Promise<{ accounts: AccountView[] }> {
        const accounts: FinancialAccount[] = await this.accounts.listAll();
        const stats: AccountStats[] = await this.transactions.statsByAccount(
            accounts.map((account: FinancialAccount): string => account.id)
        );
        const byAccount: Map<string, AccountStats> = new Map<string, AccountStats>(
            stats.map((entry: AccountStats): [string, AccountStats] => [entry.accountId, entry])
        );
        return { accounts: accounts.map((account: FinancialAccount): AccountView => toAccountView(account, byAccount.get(account.id))) };
    }

    public async rename(id: string, name: string): Promise<AccountView> {
        const renamed: FinancialAccount = await this.accounts.rename(id, name);
        const [stats] = await this.transactions.statsByAccount([id]);
        return toAccountView(renamed, stats);
    }

    public async remove(id: string): Promise<void> {
        await this.accountService.removeFileAccount(id);
    }
}
