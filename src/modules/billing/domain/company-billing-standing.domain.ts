import { Injectable } from '@nestjs/common';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { CompanyBillingStandingsRepository } from '../repositories/company-billing-standings.repository';
import { CompanyBillingStanding, StandingReason, StandingStatus } from './billing.types';

@Injectable()
export class CompanyBillingStandingDomain {
    public constructor(private readonly standings: CompanyBillingStandingsRepository) {}

    public async current(): Promise<CompanyBillingStanding | null> {
        return this.standings.current();
    }

    @UsingTransaction()
    public async replaceCurrent(status: StandingStatus, reason: StandingReason, at: Date): Promise<void> {
        await this.standings.replaceCurrent(status, reason, at);
    }

    public async countOpenByStatus(): Promise<Record<StandingStatus, number>> {
        const totals: Record<StandingStatus, number> = { active: 0, trialing: 0, past_due: 0, expired: 0 };
        for (const status of this.standings.statuses()) {
            totals[status] = await this.standings.countOpenAcrossTenants(status);
        }
        return totals;
    }
}
