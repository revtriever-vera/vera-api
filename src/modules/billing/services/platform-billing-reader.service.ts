import { Injectable } from '@nestjs/common';
import { CompanyBillingStandingDomain } from '../domain/company-billing-standing.domain';
import { STANDING_STATUSES } from '../domain/billing.types';

@Injectable()
export class PlatformBillingReaderService {
    public constructor(private readonly standings: CompanyBillingStandingDomain) {}

    public async pastDueCount(): Promise<number> {
        return (await this.standings.countOpenByStatus())[STANDING_STATUSES.pastDue];
    }
}
