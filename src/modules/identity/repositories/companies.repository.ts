import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../../core/database/database.client';
import { GlobalRepository } from '../../../core/database/repositories/global.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { Company, NewCompany } from '../domain/identity.types';

type CreateCompanyData = Pick<NewCompany, 'name'> & Partial<Pick<NewCompany, 'locale' | 'timezone'>>;

@Injectable()
export class CompaniesRepository extends GlobalRepository<'Companies'> {
    public constructor(database: DatabaseClient) {
        super(database, 'Companies');
    }

    public async create(data: CreateCompanyData): Promise<Company> {
        return this.createRow({ id: IdUtil.newId(), ...data });
    }
}
