import { Injectable } from '@nestjs/common';
import { FinancialAccountsRepository } from '../repositories/financial-accounts.repository';
import { AccountNotFoundError, TransactionLimitReachedError } from './transactions.errors';
import { CreateFileAccountInput, FinancialAccount, MAX_ACCOUNTS_PER_COMPANY, UpsertProviderAccountInput } from './transactions.types';

@Injectable()
export class FinancialAccountDomain {
    public constructor(private readonly accounts: FinancialAccountsRepository) {}

    public async createFile(input: CreateFileAccountInput): Promise<FinancialAccount> {
        await this.assertRoom();
        return this.accounts.create({
            kind: input.kind,
            name: input.name,
            institutionName: input.institutionName ?? null,
            numberLast4: input.numberLast4 ?? null,
            currency: input.currency,
            isSample: input.isSample ?? false
        });
    }

    public async upsertProvider(input: UpsertProviderAccountInput): Promise<FinancialAccount> {
        await this.assertRoom();
        return this.accounts.upsertProvider({
            kind: input.kind,
            name: input.name,
            institutionName: input.institutionName ?? null,
            numberLast4: input.numberLast4 ?? null,
            currency: input.currency,
            provider: input.provider,
            externalId: input.externalId,
            isSample: input.isSample ?? false
        });
    }

    public async require(id: string): Promise<FinancialAccount> {
        const account: FinancialAccount | null = await this.accounts.findById(id);
        if (account === null) {
            throw new AccountNotFoundError(id);
        }
        return account;
    }

    public async lock(id: string): Promise<FinancialAccount> {
        const account: FinancialAccount | null = await this.accounts.lockById(id);
        if (account === null) {
            throw new AccountNotFoundError(id);
        }
        return account;
    }

    public async findByIds(ids: readonly string[]): Promise<FinancialAccount[]> {
        return this.accounts.findByIds(ids);
    }

    public async listAll(): Promise<FinancialAccount[]> {
        return this.accounts.listAll();
    }

    public async rename(id: string, name: string): Promise<FinancialAccount> {
        const renamed: FinancialAccount | null = await this.accounts.rename(id, name);
        if (renamed === null) {
            throw new AccountNotFoundError(id);
        }
        return renamed;
    }

    public async removeMany(ids: readonly string[]): Promise<FinancialAccount[]> {
        return ids.length === 0 ? [] : this.accounts.softDeleteMany(ids);
    }

    private async assertRoom(): Promise<void> {
        if ((await this.accounts.countActive()) >= MAX_ACCOUNTS_PER_COMPANY) {
            throw new TransactionLimitReachedError(MAX_ACCOUNTS_PER_COMPANY);
        }
    }
}
