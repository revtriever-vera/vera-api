import { Injectable } from '@nestjs/common';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { FinancialAccountDomain } from '../domain/financial-account.domain';
import { TransactionImportDomain } from '../domain/transaction-import.domain';
import { TransactionDomain } from '../domain/transaction.domain';
import { AccountManagedByConnectionError } from '../domain/transactions.errors';
import { CreateFileAccountInput, FinancialAccount, UpsertProviderAccountInput } from '../domain/transactions.types';

export type { CreateFileAccountInput, FinancialAccount, UpsertProviderAccountInput };

@Injectable()
export class FinancialAccountService {
    public constructor(
        private readonly accounts: FinancialAccountDomain,
        private readonly transactions: TransactionDomain,
        private readonly imports: TransactionImportDomain
    ) {}

    public async upsertProviderAccount(input: UpsertProviderAccountInput): Promise<FinancialAccount> {
        return this.accounts.upsertProvider(input);
    }

    public async createFileAccount(input: CreateFileAccountInput): Promise<FinancialAccount> {
        return this.accounts.createFile(input);
    }

    public async list(): Promise<FinancialAccount[]> {
        return this.accounts.listAll();
    }

    public async requireById(id: string): Promise<FinancialAccount> {
        return this.accounts.require(id);
    }

    public async findByIds(ids: readonly string[]): Promise<FinancialAccount[]> {
        return this.accounts.findByIds(ids);
    }

    @UsingTransaction()
    public async removeProviderAccounts(ids: readonly string[]): Promise<number> {
        const owned: FinancialAccount[] = (await this.accounts.findByIds(ids)).filter(
            (account: FinancialAccount): boolean => account.provider !== null
        );
        return this.purge(owned.map((account: FinancialAccount): string => account.id));
    }

    @UsingTransaction()
    public async removeFileAccount(id: string): Promise<void> {
        const account: FinancialAccount = await this.accounts.require(id);
        if (account.provider !== null) {
            throw new AccountManagedByConnectionError(id);
        }
        await this.purge([id]);
    }

    private async purge(ids: readonly string[]): Promise<number> {
        await this.transactions.removeByAccounts(ids);
        await this.imports.removeByAccounts(ids);
        return (await this.accounts.removeMany(ids)).length;
    }
}
