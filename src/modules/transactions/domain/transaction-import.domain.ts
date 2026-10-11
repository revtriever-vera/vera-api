import { Injectable } from '@nestjs/common';
import { Page } from '../../../shared/pagination/pagination.types';
import { TransactionImportsRepository } from '../repositories/transaction-imports.repository';
import { ImportNotFoundError } from './transactions.errors';
import { FinishImportInput, IMPORT_STATUSES, RecordImportInput, TransactionImport } from './transactions.types';

@Injectable()
export class TransactionImportDomain {
    public constructor(private readonly imports: TransactionImportsRepository) {}

    public async record(input: RecordImportInput): Promise<TransactionImport> {
        return this.imports.create({
            accountId: input.accountId,
            format: input.format,
            fileName: input.fileName,
            fileSha256: input.fileSha256,
            rows: input.rows,
            periodStart: input.periodStart ?? null,
            periodEnd: input.periodEnd ?? null,
            isSample: input.isSample ?? false,
            status: IMPORT_STATUSES.processing
        });
    }

    public async finish(id: string, input: FinishImportInput): Promise<TransactionImport> {
        const finished: TransactionImport | null = await this.imports.finish(id, {
            inserted: input.inserted,
            duplicates: input.duplicates,
            rejected: input.rejected,
            status: input.status ?? IMPORT_STATUSES.completed
        });
        if (finished === null) {
            throw new ImportNotFoundError(id);
        }
        return finished;
    }

    public async require(id: string): Promise<TransactionImport> {
        const found: TransactionImport | null = await this.imports.findById(id);
        if (found === null) {
            throw new ImportNotFoundError(id);
        }
        return found;
    }

    public async markUndone(id: string): Promise<TransactionImport> {
        const undone: TransactionImport | null = await this.imports.markUndone(id);
        if (undone === null) {
            throw new ImportNotFoundError(id);
        }
        return undone;
    }

    public async page(page: number, pageSize: number): Promise<Page<TransactionImport>> {
        return this.imports.page(page, pageSize);
    }

    public async countCompleted(): Promise<number> {
        return this.imports.countCompleted();
    }

    public async removeByAccounts(accountIds: readonly string[]): Promise<void> {
        if (accountIds.length > 0) {
            await this.imports.softDeleteByAccounts(accountIds);
        }
    }
}
