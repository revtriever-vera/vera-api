import { Injectable } from '@nestjs/common';
import { FixedIncomeTitleDomain } from '../domain/fixed-income-title.domain';

@Injectable()
export class FixedIncomeCompaniesService {
    public constructor(private readonly titles: FixedIncomeTitleDomain) {}

    public async companyIdsWithRealTitles(): Promise<readonly string[]> {
        return this.titles.listCompanyIdsWithRealAcrossTenants();
    }
}
