import { Injectable } from '@nestjs/common';
import { AccountDataExporterPort } from '../../identity/services/account-data-exporter.port';
import { CategoryReaderService, SpendingCategory } from '../../spending-categories/services/category-reader.service';
import { FinancialAccountDomain } from '../domain/financial-account.domain';
import { TransactionImportDomain } from '../domain/transaction-import.domain';
import { ExportCursor, TransactionDomain } from '../domain/transaction.domain';
import { toDateString } from '../domain/transaction.mapper';
import { EXPORT_PAGE_SIZE, FinancialAccount, Transaction, TransactionFilter, TransactionImport } from '../domain/transactions.types';

export const TRANSACTIONS_EXPORT_AREA: string = 'transactions';

const FIRST_DAY: string = '1900-01-01';
const LAST_DAY: string = '2999-12-31';

export interface FinancialAccountExport {
    readonly name: string;
    readonly kind: string;
    readonly institutionName: string | null;
    readonly numberLast4: string | null;
    readonly currency: string;
    readonly source: 'pluggy' | 'file';
}

export interface TransactionExport {
    readonly date: string;
    readonly amountMinor: number;
    readonly currency: string;
    readonly description: string;
    readonly counterpartyName: string | null;
    readonly category: string | null;
    readonly categorySource: string;
    readonly account: string;
    readonly source: string;
    readonly installment: { readonly number: number; readonly total: number } | null;
}

export interface TransactionImportExport {
    readonly format: string;
    readonly fileName: string;
    readonly rows: number;
    readonly inserted: number;
    readonly duplicates: number;
    readonly createdAt: string;
    readonly status: string;
}

export interface TransactionsExport {
    readonly accounts: FinancialAccountExport[];
    readonly transactions: TransactionExport[];
    readonly imports: TransactionImportExport[];
}

@Injectable()
export class TransactionsAccountExporter extends AccountDataExporterPort {
    public readonly area: string = TRANSACTIONS_EXPORT_AREA;

    public constructor(
        private readonly accounts: FinancialAccountDomain,
        private readonly transactions: TransactionDomain,
        private readonly imports: TransactionImportDomain,
        private readonly categories: CategoryReaderService
    ) {
        super();
    }

    public async exportAll(): Promise<TransactionsExport> {
        const accounts: FinancialAccount[] = (await this.accounts.listAll()).filter(
            (account: FinancialAccount): boolean => !account.isSample
        );
        const names: ReadonlyMap<string, string> = new Map<string, string>(
            accounts.map((account: FinancialAccount): [string, string] => [account.id, account.name])
        );
        const keys: ReadonlyMap<string, string> = await this.categoryKeys();
        return {
            accounts: accounts.map((account: FinancialAccount): FinancialAccountExport => this.accountOf(account)),
            transactions: await this.allTransactions(names, keys),
            imports: await this.allImports()
        };
    }

    private async categoryKeys(): Promise<ReadonlyMap<string, string>> {
        const categories: readonly SpendingCategory[] = await this.categories.listForCompany();
        return new Map<string, string>(
            categories.flatMap((category: SpendingCategory): [string, string][] => {
                const key: string | null = category.systemKey ?? category.name;
                return key === null ? [] : [[category.id, key]];
            })
        );
    }

    private async allTransactions(names: ReadonlyMap<string, string>, keys: ReadonlyMap<string, string>): Promise<TransactionExport[]> {
        const filter: TransactionFilter = { fromDate: FIRST_DAY, toDate: LAST_DAY, excludeSamples: true };
        const exported: TransactionExport[] = [];
        let cursor: ExportCursor | null = null;
        let page: Transaction[] = await this.transactions.listAfter(filter, cursor, EXPORT_PAGE_SIZE);
        while (page.length > 0) {
            exported.push(...page.map((row: Transaction): TransactionExport => this.transactionOf(row, names, keys)));
            const last: Transaction | undefined = page[page.length - 1];
            cursor = last === undefined ? null : { date: toDateString(last.date), id: last.id };
            page = page.length < EXPORT_PAGE_SIZE ? [] : await this.transactions.listAfter(filter, cursor, EXPORT_PAGE_SIZE);
        }
        return exported;
    }

    private async allImports(): Promise<TransactionImportExport[]> {
        const exported: TransactionImportExport[] = [];
        let page: TransactionImport[] = await this.imports.listRealPage(0, EXPORT_PAGE_SIZE);
        while (page.length > 0) {
            exported.push(...page.map((item: TransactionImport): TransactionImportExport => this.importOf(item)));
            page = page.length < EXPORT_PAGE_SIZE ? [] : await this.imports.listRealPage(exported.length, EXPORT_PAGE_SIZE);
        }
        return exported;
    }

    private accountOf(account: FinancialAccount): FinancialAccountExport {
        return {
            name: account.name,
            kind: account.kind,
            institutionName: account.institutionName,
            numberLast4: account.numberLast4,
            currency: account.currency,
            source: account.provider === null ? 'file' : 'pluggy'
        };
    }

    private transactionOf(row: Transaction, names: ReadonlyMap<string, string>, keys: ReadonlyMap<string, string>): TransactionExport {
        const hasInstallment: boolean = row.installmentNumber !== null && row.installmentTotal !== null;
        return {
            date: toDateString(row.date),
            amountMinor: Number(row.amountMinor),
            currency: row.currency,
            description: row.description,
            counterpartyName: row.counterpartyName,
            category: row.categoryId === null ? null : (keys.get(row.categoryId) ?? null),
            categorySource: row.categorySource,
            account: names.get(row.accountId) ?? '',
            source: row.source,
            installment: hasInstallment ? { number: row.installmentNumber ?? 0, total: row.installmentTotal ?? 0 } : null
        };
    }

    private importOf(item: TransactionImport): TransactionImportExport {
        return {
            format: item.format,
            fileName: item.fileName,
            rows: item.rows,
            inserted: item.inserted,
            duplicates: item.duplicates,
            createdAt: item.createdAt.toISOString(),
            status: item.status
        };
    }
}
