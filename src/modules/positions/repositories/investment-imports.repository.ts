import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { Page } from '../../../shared/pagination/pagination.types';
import { IdUtil } from '../../../shared/utils/id.util';
import { InvestmentImport, NewInvestmentImport } from '../domain/investment-operations.types';

type CreateImportData = Pick<NewInvestmentImport, 'createdBy' | 'source' | 'fileSha256' | 'fileName' | 'noteNumbers'>;
type SnapshotsData = Pick<NewInvestmentImport, 'positionsBefore' | 'positionsAfter'>;

const IMPORT_LIMIT: number = 1000;

@Injectable()
export class InvestmentImportsRepository extends TenantRepository<'InvestmentImports'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'InvestmentImports');
    }

    public async create(data: CreateImportData): Promise<InvestmentImport> {
        return this.createRow({ id: IdUtil.newId(), companyId: this.companyId, ...data });
    }

    public async listAll(): Promise<InvestmentImport[]> {
        return this.findMany({}, { limit: IMPORT_LIMIT, orderBy: [{ property: 'createdAt', direction: 'asc' }] });
    }

    public async page(page: number, pageSize: number): Promise<Page<InvestmentImport>> {
        return this.findAllPaginated({ page, pageSize, orderBy: [{ property: 'createdAt', direction: 'desc' }] });
    }

    public async findCompletedByHash(fileSha256: string): Promise<InvestmentImport | null> {
        const row: InvestmentImport | undefined = await this.selectScoped()
            .selectAll()
            .where('status', '=', 'completed')
            .where('deletedAt', 'is', null)
            .where('fileSha256', '=', fileSha256)
            .orderBy('createdAt', 'desc')
            .limit(1)
            .executeTakeFirst();
        return row ?? null;
    }

    public async saveSnapshots(id: string, snapshots: SnapshotsData): Promise<InvestmentImport | null> {
        return this.updateRow(id, snapshots);
    }

    public async markUndone(id: string): Promise<InvestmentImport | null> {
        return this.updateRow(id, { status: 'undone' });
    }
}
