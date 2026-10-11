import { Injectable } from '@nestjs/common';
import { SampleDataPort } from '../../onboarding/services/sample-data.port';
import { CategoryReaderService } from '../../spending-categories/services/category-reader.service';
import { CategoryRuleService } from '../../spending-categories/services/category-rule.service';
import { DateUtil } from '../../../shared/utils/date.util';
import { FinancialAccountDomain } from '../domain/financial-account.domain';
import { TransactionImportDomain } from '../domain/transaction-import.domain';
import { TransactionDomain } from '../domain/transaction.domain';
import { DatasetAccount, DatasetTransaction, SpendingDataset } from '../domain/spending-dataset';
import { AccountStats, FinancialAccount, IncomingTransaction, IngestionResult, TRANSACTION_SOURCES } from '../domain/transactions.types';
import { SpendingDatasetService } from './spending-dataset.service';
import { TransactionIngestionService } from './transaction-ingestion.service';
import { TransactionsLogService } from './transactions-log.service';

export const SPENDING_SAMPLE_AREA: string = 'spending';

const SAMPLE_ACCOUNT_NAMES: Readonly<Record<string, string>> = {
    'nubank-card': 'Cartão de exemplo',
    'nubank-checking': 'Conta de exemplo',
    'itau-checking': 'Conta 2 de exemplo'
};

@Injectable()
export class SpendingSampleDataService extends SampleDataPort {
    public readonly area: string = SPENDING_SAMPLE_AREA;

    public constructor(
        private readonly accounts: FinancialAccountDomain,
        private readonly transactions: TransactionDomain,
        private readonly imports: TransactionImportDomain,
        private readonly categories: CategoryReaderService,
        private readonly rules: CategoryRuleService,
        private readonly dataset: SpendingDatasetService,
        private readonly ingestion: TransactionIngestionService,
        private readonly logs: TransactionsLogService
    ) {
        super();
    }

    public async seed(): Promise<number> {
        if ((await this.hasRealData()) || (await this.hasSamples())) {
            this.logs.sample('skipped', 0);
            return 0;
        }
        await this.categories.listForCompany();
        const dataset: SpendingDataset = this.dataset.build(DateUtil.todayInBrazil());
        const byAccount: Map<string, DatasetTransaction[]> = new Map<string, DatasetTransaction[]>();
        for (const item of dataset.transactions) {
            byAccount.set(item.accountKey, [...(byAccount.get(item.accountKey) ?? []), item]);
        }
        let seeded: number = 0;
        for (const spec of dataset.accounts) {
            seeded += await this.ingest(await this.createAccount(spec), byAccount.get(spec.key) ?? []);
        }
        this.logs.sample('seeded', seeded);
        return seeded;
    }

    public async clear(): Promise<number> {
        const removed: number = await this.transactions.removeSamples();
        await this.imports.removeSamples();
        await this.removeSampleAccounts();
        await this.rules.removeSamples();
        this.logs.sample('cleared', removed);
        return removed;
    }

    private async hasRealData(): Promise<boolean> {
        const real: FinancialAccount[] = (await this.accounts.listAll()).filter((account: FinancialAccount): boolean => !account.isSample);
        return real.length > 0 || (await this.transactions.countReal()) > 0;
    }

    private async hasSamples(): Promise<boolean> {
        const samples: FinancialAccount[] = (await this.accounts.listAll()).filter(
            (account: FinancialAccount): boolean => account.isSample
        );
        return samples.length > 0 || (await this.transactions.countSamples()) > 0;
    }

    private async createAccount(spec: DatasetAccount): Promise<FinancialAccount> {
        return this.accounts.createFile({
            kind: spec.kind,
            name: SAMPLE_ACCOUNT_NAMES[spec.key] ?? spec.name,
            institutionName: spec.institutionName,
            numberLast4: spec.numberLast4,
            currency: spec.currency,
            isSample: true
        });
    }

    private async ingest(account: FinancialAccount, items: readonly DatasetTransaction[]): Promise<number> {
        const result: IngestionResult = await this.ingestion.ingest({
            accountId: account.id,
            source: TRANSACTION_SOURCES.sample,
            isSample: true,
            items: items.map((item: DatasetTransaction): IncomingTransaction => this.incomingOf(item, account.currency))
        });
        return result.inserted;
    }

    private incomingOf(item: DatasetTransaction, currency: string): IncomingTransaction {
        return {
            externalId: `sample:${item.key}`,
            date: item.date,
            amountMinor: item.amountMinor,
            currency,
            description: item.description,
            counterpartyName: item.counterpartyName,
            counterpartyDocument: item.counterpartyDocument,
            providerCategoryId: item.providerCategoryId
        };
    }

    private async removeSampleAccounts(): Promise<void> {
        const samples: FinancialAccount[] = (await this.accounts.listAll()).filter(
            (account: FinancialAccount): boolean => account.isSample
        );
        const stats: AccountStats[] = await this.transactions.statsByAccount(
            samples.map((account: FinancialAccount): string => account.id)
        );
        const occupied: ReadonlySet<string> = new Set<string>(
            stats.filter((item: AccountStats): boolean => item.transactionCount > 0).map((item: AccountStats): string => item.accountId)
        );
        await this.accounts.removeMany(
            samples
                .filter((account: FinancialAccount): boolean => !occupied.has(account.id))
                .map((account: FinancialAccount): string => account.id)
        );
    }
}
