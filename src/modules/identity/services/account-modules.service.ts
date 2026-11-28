import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { CompanyDomain } from '../domain/company.domain';
import { AccountClosedError, UnauthorizedError } from '../domain/identity.errors';
import { AccountModules, AccountModulesChange, Company, modulesOf } from '../domain/identity.types';

@Injectable()
export class AccountModulesService {
    public constructor(
        private readonly companies: CompanyDomain,
        private readonly context: AppContext
    ) {}

    public async current(): Promise<AccountModules> {
        const companyId: string = this.companyId();
        const company: Company | null = await this.companies.findById(companyId);
        if (!company) {
            throw new AccountClosedError(companyId);
        }
        return modulesOf(company);
    }

    public async change(change: AccountModulesChange): Promise<AccountModules> {
        return this.companies.updateModules(this.companyId(), change);
    }

    private companyId(): string {
        const companyId: string | undefined = this.context.get().companyId;
        if (companyId === undefined) {
            throw new UnauthorizedError();
        }
        return companyId;
    }
}
