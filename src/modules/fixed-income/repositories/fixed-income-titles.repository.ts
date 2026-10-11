import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { Page } from '../../../shared/pagination/pagination.types';
import { IdUtil } from '../../../shared/utils/id.util';
import { FixedIncomeTitleRow, MAX_TITLES_PER_COMPANY, NewFixedIncomeTitle } from '../domain/fixed-income.types';

type TitleFields = Pick<
    NewFixedIncomeTitle,
    'kind' | 'name' | 'indexer' | 'rateBps' | 'currency' | 'appliedMinor' | 'appliedAt' | 'maturityDate' | 'taxRegime'
>;

const LIST_LIMIT: number = MAX_TITLES_PER_COMPANY + 50;

@Injectable()
export class FixedIncomeTitlesRepository extends TenantRepository<'FixedIncomeTitles'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'FixedIncomeTitles');
    }

    public async insert(fields: TitleFields): Promise<FixedIncomeTitleRow> {
        return this.createRow({ id: IdUtil.newId(), companyId: this.companyId, ...fields });
    }

    public async listAll(): Promise<FixedIncomeTitleRow[]> {
        return this.findMany({}, { limit: LIST_LIMIT, orderBy: [{ property: 'createdAt', direction: 'desc' }] });
    }

    public async countActive(): Promise<number> {
        const page: Page<FixedIncomeTitleRow> = await this.findAllPaginated({ page: 1, pageSize: 1 });
        return page.pagination.totalRecords;
    }

    public async patch(id: string, fields: TitleFields): Promise<FixedIncomeTitleRow | null> {
        return this.updateRow(id, fields);
    }

    public async softDelete(id: string): Promise<FixedIncomeTitleRow | null> {
        return this.softDeleteRow(id);
    }
}
