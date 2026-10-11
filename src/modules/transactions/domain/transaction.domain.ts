import { Injectable } from '@nestjs/common';
import { ExportCursor, RowSelection, TransactionsRepository } from '../repositories/transactions.repository';
import { addDays } from './calendar';
import { TransactionLimitReachedError, TransactionNotFoundError } from './transactions.errors';
import {
    AccountStats,
    CategorizationOutcome,
    MAX_TRANSACTIONS_PER_COMPANY,
    MonthlyCategoryNet,
    MonthRange,
    NewTransaction,
    Transaction,
    TransactionFilter,
    TransactionPatch,
    TransactionTotals
} from './transactions.types';

export type { ExportCursor, RowSelection };

@Injectable()
export class TransactionDomain {
    public constructor(private readonly transactions: TransactionsRepository) {}

    public newId(): string {
        return this.transactions.newId();
    }

    public async require(id: string): Promise<Transaction> {
        const found: Transaction | null = await this.transactions.findById(id);
        if (found === null) {
            throw new TransactionNotFoundError(id);
        }
        return found;
    }

    public async assertRoomFor(additional: number): Promise<void> {
        if (additional > 0 && (await this.transactions.countActive()) + additional > MAX_TRANSACTIONS_PER_COMPANY) {
            throw new TransactionLimitReachedError(MAX_TRANSACTIONS_PER_COMPANY);
        }
    }

    public async findByExternalIds(accountId: string, externalIds: readonly string[]): Promise<Transaction[]> {
        return this.transactions.findByExternalIds(accountId, externalIds);
    }

    public async findAbsorbing(accountId: string, externalIds: readonly string[]): Promise<Transaction[]> {
        return this.transactions.findAbsorbing(accountId, externalIds);
    }

    public async unabsorbedProviderRows(accountId: string, fromDate: string, toDate: string): Promise<Transaction[]> {
        return this.transactions.listUnabsorbedProviderRows(accountId, addDays(fromDate, -1), addDays(toDate, 1));
    }

    public async fileRows(accountId: string, fromDate: string, toDate: string): Promise<Transaction[]> {
        return this.transactions.listFileRows(accountId, addDays(fromDate, -1), addDays(toDate, 1));
    }

    public async insertMany(rows: readonly NewTransaction[]): Promise<string[]> {
        return this.transactions.insertManyIfAbsent(rows);
    }

    public async patch(id: string, patch: TransactionPatch): Promise<Transaction> {
        const patched: Transaction | null = await this.transactions.patch(id, patch);
        if (patched === null) {
            throw new TransactionNotFoundError(id);
        }
        return patched;
    }

    public async markSuperseded(id: string, supersededById: string): Promise<void> {
        await this.transactions.markSuperseded(id, supersededById);
    }

    public async markAbsorbed(id: string, absorbedExternalId: string, absorbedImportId: string | null): Promise<void> {
        await this.transactions.markAbsorbed(id, absorbedExternalId, absorbedImportId);
    }

    public async listPage(filter: TransactionFilter, page: number, pageSize: number): Promise<Transaction[]> {
        return this.transactions.listPage(filter, page, pageSize);
    }

    public async listAfter(filter: TransactionFilter, cursor: ExportCursor | null, size: number): Promise<Transaction[]> {
        return this.transactions.listAfter(filter, cursor, size);
    }

    public async totals(filter: TransactionFilter): Promise<TransactionTotals> {
        return this.transactions.totals(filter);
    }

    public async countReal(): Promise<number> {
        return this.transactions.countReal();
    }

    public async countSamples(): Promise<number> {
        return this.transactions.countSamples();
    }

    public async removeSamples(): Promise<number> {
        return this.transactions.softDeleteSamples();
    }

    public async countUncategorizedOutgoing(): Promise<number> {
        return this.transactions.countUncategorizedOutgoing();
    }

    public async statsByAccount(accountIds: readonly string[]): Promise<AccountStats[]> {
        return this.transactions.statsByAccount(accountIds);
    }

    public async monthlyNetByCategory(range: MonthRange): Promise<MonthlyCategoryNet[]> {
        return this.transactions.monthlyNetByCategory(range);
    }

    public async monthsWithData(range: MonthRange): Promise<string[]> {
        return this.transactions.monthsWithData(range);
    }

    public async countOtherCurrencies(month: string): Promise<number> {
        return this.transactions.countOtherCurrencies(month);
    }

    public async removeByAccounts(accountIds: readonly string[]): Promise<number> {
        return accountIds.length === 0 ? 0 : this.transactions.softDeleteByAccounts(accountIds);
    }

    public async removeByImport(importId: string): Promise<number> {
        return this.transactions.softDeleteByImport(importId);
    }

    public async releaseAbsorbedByImport(importId: string): Promise<number> {
        return this.transactions.clearAbsorbedByImport(importId);
    }

    public async selectBatch(selection: RowSelection, afterId: string | null, size: number, includeUser: boolean): Promise<Transaction[]> {
        return this.transactions.selectBatch(selection, afterId, size, includeUser);
    }

    public async countSelection(selection: RowSelection, includeUser: boolean): Promise<number> {
        return this.transactions.countSelection(selection, includeUser);
    }

    public async applyOutcome(ids: readonly string[], outcome: CategorizationOutcome): Promise<number> {
        return ids.length === 0 ? 0 : this.transactions.applyOutcome(ids, outcome);
    }

    public async moveCategory(ids: readonly string[], categoryId: string): Promise<number> {
        return ids.length === 0 ? 0 : this.transactions.moveCategory(ids, categoryId);
    }
}
