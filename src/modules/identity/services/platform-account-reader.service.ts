import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { Page } from '../../../shared/pagination/pagination.types';
import { CompanyDomain } from '../domain/company.domain';
import { Company, User } from '../domain/identity.types';
import { UserDomain } from '../domain/user.domain';
import { AccountDataRegistry } from './account-data.registry';
import { redactSecrets } from './platform-account-redaction';

export const SUMMARY_AREAS: readonly string[] = ['billing', 'signup_offer', 'usage'];

export const DATA_AREAS: readonly string[] = [
    'positions',
    'fixed_income',
    'allocation',
    'goals',
    'transactions',
    'spending_categories',
    'spending_settings',
    'recurring',
    'bank_connections'
];

export interface CustomerMember {
    readonly id: string;
    readonly name: string;
    readonly email: string;
    readonly role: string;
    readonly joinedAt: Date;
}

export interface CustomerAccount {
    readonly id: string;
    readonly name: string;
    readonly locale: string;
    readonly timezone: string;
    readonly createdAt: Date;
}

export interface CustomerPage {
    readonly items: CustomerAccount[];
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
}

export interface CustomerOverview {
    readonly total: number;
    readonly createdSince: number;
}

function toAccount(company: Company): CustomerAccount {
    return { id: company.id, name: company.name, locale: company.locale, timezone: company.timezone, createdAt: company.createdAt };
}

@Injectable()
export class PlatformAccountReaderService {
    public constructor(
        private readonly companies: CompanyDomain,
        private readonly users: UserDomain,
        private readonly registry: AccountDataRegistry
    ) {}

    public async page(page: number, pageSize: number, searchText: string | undefined): Promise<CustomerPage> {
        const result: Page<Company> = await this.companies.pageCustomers(page, pageSize, searchText);
        return {
            items: result.data.map(toAccount),
            page: result.pagination.page,
            pageSize: result.pagination.pageSize,
            total: result.pagination.totalRecords
        };
    }

    public async overview(since: Date): Promise<CustomerOverview> {
        return {
            total: await this.companies.countCustomers(null),
            createdSince: await this.companies.countCustomers(since)
        };
    }

    public async find(companyId: string): Promise<CustomerAccount | null> {
        const company: Company | null = await this.companies.findCustomer(companyId);
        return company === null ? null : toAccount(company);
    }

    @AsCompany()
    public async members(_companyId: string): Promise<CustomerMember[]> {
        return (await this.users.listMembers()).map((user: User): CustomerMember => ({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            joinedAt: user.createdAt
        }));
    }

    @AsCompany()
    public async summarySections(companyId: string): Promise<Record<string, unknown>> {
        return this.sectionsOf(companyId, SUMMARY_AREAS);
    }

    @AsCompany()
    public async dataSections(companyId: string): Promise<Record<string, unknown>> {
        return this.sectionsOf(companyId, DATA_AREAS);
    }

    private async sectionsOf(companyId: string, areas: readonly string[]): Promise<Record<string, unknown>> {
        return redactSecrets(await this.registry.exportSelected(companyId, areas)) as Record<string, unknown>;
    }
}
