import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DateUtil } from '../../../shared/utils/date.util';
import { CompanyDomain } from '../domain/company.domain';
import { Company } from '../domain/identity.types';

@Injectable()
export class CompanyTimezoneService {
    public constructor(
        private readonly companies: CompanyDomain,
        private readonly context: AppContext
    ) {}

    public async todayInCompany(now: Date = new Date()): Promise<string> {
        const companyId: string | undefined = this.context.get().companyId;
        const company: Company | null = companyId === undefined ? null : await this.companies.findById(companyId);
        return DateUtil.localDateIn(company?.timezone ?? DateUtil.BRAZIL_TIMEZONE, now);
    }
}
