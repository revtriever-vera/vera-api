import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../../core/database/database.client';
import { GlobalRepository } from '../../../core/database/repositories/global.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { Company, NewCompany } from '../domain/identity.types';

const HARD_DELETE_BATCH: number = 10;

type CreateCompanyData = Pick<NewCompany, 'name'> & Partial<Pick<NewCompany, 'locale' | 'timezone' | 'isPlatform'>>;

@Injectable()
export class CompaniesRepository extends GlobalRepository<'Companies'> {
    public constructor(database: DatabaseClient) {
        super(database, 'Companies');
    }

    public async create(data: CreateCompanyData): Promise<Company> {
        return this.createRow({ id: IdUtil.newId(), ...data });
    }

    public async findPlatform(): Promise<Company | null> {
        return this.findOne({ isPlatform: true });
    }

    public async lockById(id: string): Promise<Company | null> {
        const row: Company | undefined = await this.selectSkipConstraint()
            .selectAll()
            .where('id', '=', id)
            .where('deletedAt', 'is', null)
            .forNoKeyUpdate()
            .executeTakeFirst();
        return row ?? null;
    }

    public async markTrialStarted(id: string, at: Date): Promise<boolean> {
        const rows: Company[] = await this.updateManyRows({ id, trialStartedAt: null }, { trialStartedAt: at, updatedAt: at });
        return rows.length > 0;
    }

    public async hardDeleteById(id: string): Promise<boolean> {
        return (await this.hardDeleteWhere({ id }, HARD_DELETE_BATCH)) > 0;
    }
}
