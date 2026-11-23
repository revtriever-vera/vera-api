import { Injectable } from '@nestjs/common';
import { AppLocale, DEFAULT_LOCALE } from '../../../shared/i18n/locale';
import { CompanyDomain } from '../domain/company.domain';
import { Company, User, effectiveLocale } from '../domain/identity.types';
import { UserDomain } from '../domain/user.domain';

@Injectable()
export class UserLocaleService {
    public constructor(
        private readonly users: UserDomain,
        private readonly companies: CompanyDomain
    ) {}

    public async localeOf(userId: string, companyId: string): Promise<AppLocale> {
        const user: User | null = await this.users.findById(userId);
        const company: Company | null = await this.companies.findById(companyId);
        if (user === null || company === null) {
            return DEFAULT_LOCALE;
        }
        return effectiveLocale(user, company);
    }
}
