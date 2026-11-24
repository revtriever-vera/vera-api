import { Injectable } from '@nestjs/common';
import { BillingInvoiceDomain } from '../domain/billing-invoice.domain';
import { BillingInvoice, RevtrieverEvent, STANDING_STATUSES } from '../domain/billing.types';
import { CompanyBillingStandingDomain } from '../domain/company-billing-standing.domain';
import { RevtrieverEventDomain } from '../domain/revtriever-event.domain';

export interface PlatformOverdueInvoice {
    readonly id: string;
    readonly companyId: string;
    readonly totalCents: number | null;
    readonly dueDate: Date | null;
    readonly overdueAt: Date | null;
}

export interface PlatformBillingEvent {
    readonly id: string;
    readonly type: string;
    readonly status: string;
    readonly receivedAt: Date;
    readonly processedAt: Date | null;
    readonly error: string | null;
}

export interface PlatformBillingStatus {
    readonly pastDueAccounts: number;
    readonly overdueInvoices: PlatformOverdueInvoice[];
    readonly recentEvents: PlatformBillingEvent[];
}

@Injectable()
export class PlatformBillingReaderService {
    public constructor(
        private readonly standings: CompanyBillingStandingDomain,
        private readonly invoices: BillingInvoiceDomain,
        private readonly events: RevtrieverEventDomain
    ) {}

    public async pastDueCount(): Promise<number> {
        return (await this.standings.countOpenByStatus())[STANDING_STATUSES.pastDue];
    }

    public async status(limit: number): Promise<PlatformBillingStatus> {
        const overdue: BillingInvoice[] = await this.invoices.listOverdueAcrossTenants(limit);
        const recent: RevtrieverEvent[] = await this.events.listRecent(limit);
        return {
            pastDueAccounts: await this.pastDueCount(),
            overdueInvoices: overdue.map((invoice: BillingInvoice): PlatformOverdueInvoice => ({
                id: invoice.id,
                companyId: invoice.companyId,
                totalCents: invoice.totalCents === null ? null : Number(invoice.totalCents),
                dueDate: invoice.dueDate,
                overdueAt: invoice.overdueAt
            })),
            recentEvents: recent.map((event: RevtrieverEvent): PlatformBillingEvent => ({
                id: event.id,
                type: event.type,
                status: event.status,
                receivedAt: event.receivedAt,
                processedAt: event.processedAt,
                error: event.error
            }))
        };
    }
}
