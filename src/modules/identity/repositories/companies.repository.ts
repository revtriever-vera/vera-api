import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../../core/database/database.client';
import { GlobalRepository } from '../../../core/database/repositories/global.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { Company, NewCompany } from '../domain/identity.types';

const HARD_DELETE_BATCH: number = 10;

type CreateCompanyData = Pick<NewCompany, 'name'> & Partial<Pick<NewCompany, 'locale' | 'timezone'>>;

@Injectable()
export class CompaniesRepository extends GlobalRepository<'Companies'> {
    public constructor(database: DatabaseClient) {
        super(database, 'Companies');
    }

    public async create(data: CreateCompanyData): Promise<Company> {
        return this.createRow({ id: IdUtil.newId(), ...data });
    }

    public async hardDeleteById(id: string): Promise<boolean> {
        return (await this.hardDeleteWhere({ id }, HARD_DELETE_BATCH)) > 0;
    }
}
