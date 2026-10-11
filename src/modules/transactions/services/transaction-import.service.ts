import { Injectable } from '@nestjs/common';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { Page } from '../../../shared/pagination/pagination.types';
import { FinancialAccountDomain } from '../domain/financial-account.domain';
import { TransactionImportDomain } from '../domain/transaction-import.domain';
import { TransactionDomain } from '../domain/transaction.domain';
import { toImportView } from '../domain/transaction.mapper';
import {
    FinishImportInput,
    IMPORT_LIST_PAGE_SIZE,
    IMPORT_STATUSES,
    ImportView,
    RecordImportInput,
    TransactionImport
} from '../domain/transactions.types';

export type { FinishImportInput, ImportView, RecordImportInput };

@Injectable()
export class TransactionImportService {
    public constructor(
        private readonly imports: TransactionImportDomain,
        private readonly accounts: FinancialAccountDomain,
        private readonly transactions: TransactionDomain
    ) {}

    public async record(input: RecordImportInput): Promise<ImportView> {
        await this.accounts.require(input.accountId);
        return toImportView(await this.imports.record(input));
    }

    public async finish(id: string, counts: FinishImportInput): Promise<ImportView> {
        return toImportView(await this.imports.finish(id, counts));
    }

    @UsingTransaction()
    public async undo(id: string): Promise<{ removed: number }> {
        const current: TransactionImport = await this.imports.require(id);
        if (current.status === IMPORT_STATUSES.undone) {
            return { removed: 0 };
        }
        const removed: number = await this.transactions.removeByImport(id);
        await this.transactions.releaseAbsorbedByImport(id);
        await this.imports.markUndone(id);
        return { removed };
    }

    public async find(id: string): Promise<ImportView> {
        return toImportView(await this.imports.require(id));
    }

    public async findCompletedByHash(fileSha256: string): Promise<ImportView | null> {
        const found: TransactionImport | null = await this.imports.findCompletedByHash(fileSha256);
        return found === null ? null : toImportView(found);
    }

    public async list(page: number, pageSize: number = IMPORT_LIST_PAGE_SIZE): Promise<Page<ImportView>> {
        const result: Page<TransactionImport> = await this.imports.page(page, pageSize);
        return { data: result.data.map(toImportView), pagination: result.pagination };
    }

    public async countCompleted(): Promise<number> {
        return this.imports.countCompleted();
    }
}
