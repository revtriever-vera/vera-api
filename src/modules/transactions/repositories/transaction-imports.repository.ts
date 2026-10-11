import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { Page } from '../../../shared/pagination/pagination.types';
import { IdUtil } from '../../../shared/utils/id.util';
import { IMPORT_STATUSES, NewTransactionImport, TransactionImport } from '../domain/transactions.types';

type CreateImportData = Pick<
    NewTransactionImport,
    'accountId' | 'format' | 'fileName' | 'fileSha256' | 'rows' | 'periodStart' | 'periodEnd' | 'isSample' | 'status'
>;
type FinishImportData = Pick<NewTransactionImport, 'inserted' | 'duplicates' | 'rejected' | 'status'>;

@Injectable()
export class TransactionImportsRepository extends TenantRepository<'TransactionImports'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'TransactionImports');
    }

    public async create(data: CreateImportData): Promise<TransactionImport> {
        return this.createRow({ id: IdUtil.newId(), companyId: this.companyId, ...data });
    }

    public async finish(id: string, data: FinishImportData): Promise<TransactionImport | null> {
        return this.updateRow(id, data);
    }

    public async markUndone(id: string): Promise<TransactionImport | null> {
        return this.updateRow(id, { status: IMPORT_STATUSES.undone });
    }

    public async page(page: number, pageSize: number): Promise<Page<TransactionImport>> {
        return this.findAllPaginated({ page, pageSize, orderBy: [{ property: 'createdAt', direction: 'desc' }] });
    }

    public async countCompleted(): Promise<number> {
        const row: { total: string | number | bigint } | undefined = await this.db
            .selectFrom('TransactionImports')
            .select((builder) => builder.fn.countAll().as('total'))
            .where('companyId', '=', this.companyId)
            .where('deletedAt', 'is', null)
            .where('status', '=', IMPORT_STATUSES.completed)
            .where('inserted', '>', 0)
            .where('isSample', '=', false)
            .executeTakeFirst();
        return Number(row?.total ?? 0);
    }

    public async softDeleteByAccounts(accountIds: readonly string[]): Promise<TransactionImport[]> {
        return this.updateManyRows({ accountId: [...accountIds] }, { deletedAt: new Date() });
    }
}
