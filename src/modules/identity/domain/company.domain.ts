import { Injectable } from '@nestjs/common';
import { AppLocale } from '../../../shared/i18n/locale';
import { CompaniesRepository } from '../repositories/companies.repository';
import { Page } from '../../../shared/pagination/pagination.types';
import { AccountClosedError, AccountModulesEmptyError } from './identity.errors';
import { AccountModules, AccountModulesChange, Company, modulesOf } from './identity.types';

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

    public async createPlatform(name: string): Promise<Company> {
        return this.companies.create({ name, isPlatform: true });
    }

    public async findPlatform(): Promise<Company | null> {
        return this.companies.findPlatform();
    }

    public async findById(id: string): Promise<Company | null> {
        return this.companies.findById(id);
    }

    public async pageCustomers(page: number, pageSize: number, searchText: string | undefined): Promise<Page<Company>> {
        return this.companies.pageCustomers(page, pageSize, searchText);
    }

    public async countCustomers(createdSince: Date | null): Promise<number> {
        return this.companies.countCustomers(createdSince);
    }

    public async findCustomer(id: string): Promise<Company | null> {
        const company: Company | null = await this.companies.findById(id);
        return company === null || company.isPlatform ? null : company;
    }

    public async lock(companyId: string): Promise<Company | null> {
        return this.companies.lockById(companyId);
    }

    public async markTrialStarted(companyId: string, at: Date): Promise<boolean> {
        return this.companies.markTrialStarted(companyId, at);
    }

    public async updateModules(companyId: string, change: AccountModulesChange): Promise<AccountModules> {
        const company: Company | null = await this.companies.lockById(companyId);
        if (!company) {
            throw new AccountClosedError(companyId);
        }
        const current: AccountModules = modulesOf(company);
        const next: AccountModules = { portfolio: change.portfolio ?? current.portfolio, spending: change.spending ?? current.spending };
        if (!next.portfolio && !next.spending) {
            throw new AccountModulesEmptyError();
        }
        const updated: Company | null = await this.companies.updateModules(companyId, {
            portfolioModuleEnabled: next.portfolio,
            spendingModuleEnabled: next.spending
        });
        return updated ? modulesOf(updated) : next;
    }

    public async eraseCompany(companyId: string): Promise<boolean> {
        return this.companies.hardDeleteById(companyId);
    }
}
