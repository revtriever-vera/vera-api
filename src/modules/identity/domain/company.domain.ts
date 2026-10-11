import { Injectable } from '@nestjs/common';
import { AppLocale } from '../../../shared/i18n/locale';
import { CompaniesRepository } from '../repositories/companies.repository';
import { Company } from './identity.types';

export interface CreateCompanyInput {
    readonly name: string;
    readonly locale?: AppLocale;
}

@Injectable()
export class CompanyDomain {
    public constructor(private readonly companies: CompaniesRepository) {}

    public async create(input: CreateCompanyInput): Promise<Company> {
        return this.companies.create({ name: input.name, locale: input.locale });
    }

    public async findById(id: string): Promise<Company | null> {
        return this.companies.findById(id);
    }
}
