import { Injectable } from '@nestjs/common';
import { BillingInvoiceDomain } from '../domain/billing-invoice.domain';
import { BillingSubscriptionDomain } from '../domain/billing-subscription.domain';
import { StandingStatus, SWEEP_BATCH } from '../domain/billing.types';
import { CompanyBillingStandingDomain } from '../domain/company-billing-standing.domain';
import { BillingMetricsService } from './billing-metrics.service';
import { BillingStandingService } from './billing-standing.service';

@Injectable()
export class BillingSweepService {
    public constructor(
        private readonly invoices: BillingInvoiceDomain,
        private readonly subscriptions: BillingSubscriptionDomain,
        private readonly standings: CompanyBillingStandingDomain,
        private readonly standing: BillingStandingService,
        private readonly metrics: BillingMetricsService
    ) {}

    public async sweep(): Promise<number> {
        const now: Date = new Date();
        const overdue: string[] = await this.invoices.companiesWithOverdueAcrossTenants(SWEEP_BATCH);
        const ended: string[] = await this.subscriptions.companiesWithEndedCancellationAcrossTenants(now, SWEEP_BATCH);
        const companies: Set<string> = new Set<string>([...overdue, ...ended]);
        for (const companyId of companies) {
            await this.standing.recomputeFor(companyId, now);
        }
        const totals: Record<StandingStatus, number> = await this.standings.countOpenByStatus();
        this.metrics.standing('active', totals.active);
        this.metrics.standing('past_due', totals.past_due);
        this.metrics.standing('expired', totals.expired);
        return companies.size;
    }
}
