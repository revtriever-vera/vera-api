import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { CompanyDomain } from '../domain/company.domain';
import { Company } from '../domain/identity.types';

export interface CompanyTrialHistory {
    readonly isPlatform: boolean;
    readonly trialUsed: boolean;
}

@Injectable()
export class CompanyTrialService {
    public constructor(
        private readonly companies: CompanyDomain,
        private readonly context: AppContext
    ) {}

    public async markStarted(at: Date): Promise<boolean> {
        const companyId: string | undefined = this.context.get().companyId;
        if (companyId === undefined) {
            return false;
        }
        return this.companies.markTrialStarted(companyId, at);
    }

    public async history(): Promise<CompanyTrialHistory> {
        const companyId: string | undefined = this.context.get().companyId;
        const company: Company | null = companyId === undefined ? null : await this.companies.findById(companyId);
        return { isPlatform: company?.isPlatform ?? false, trialUsed: company?.trialStartedAt !== null };
    }
}
