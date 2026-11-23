import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { AccountDataExporterPort } from '../../identity/services/account-data-exporter.port';
import { BillingInvoiceDomain } from '../domain/billing-invoice.domain';
import { BillingSubscriptionDomain } from '../domain/billing-subscription.domain';
import { BillingInvoice, BillingSubscription, InvoicePage } from '../domain/billing.types';

export const BILLING_EXPORT_AREA: string = 'billing';
const EXPORT_PAGE_SIZE: number = 100;

function subscriptionView(row: BillingSubscription): Record<string, unknown> {
    return {
        id: row.id,
        status: row.status,
        paymentMethod: row.paymentMethod,
        paidThrough: row.paidThrough,
        firstPaidAt: row.firstPaidAt,
        canceledAt: row.canceledAt,
        cardBrand: row.cardBrand,
        cardLast4: row.cardLast4,
        createdAt: row.createdAt
    };
}

function invoiceView(row: BillingInvoice): Record<string, unknown> {
    return {
        id: row.id,
        status: row.status,
        totalCents: row.totalCents === null ? null : Number(row.totalCents),
        method: row.method,
        dueDate: row.dueDate,
        cycleStart: row.cycleStart,
        cycleEnd: row.cycleEnd,
        paidAt: row.paidAt
    };
}

@Injectable()
export class BillingAccountExporter extends AccountDataExporterPort {
    public readonly area: string = BILLING_EXPORT_AREA;

    public constructor(
        private readonly subscriptions: BillingSubscriptionDomain,
        private readonly invoices: BillingInvoiceDomain
    ) {
        super();
    }

    @AsCompany()
    public async exportAll(_companyId: string): Promise<unknown> {
        const subscriptions: BillingSubscription[] = await this.subscriptions.listOfCompany();
        const page: InvoicePage = await this.invoices.pageOfCompany(1, EXPORT_PAGE_SIZE);
        return { subscriptions: subscriptions.map(subscriptionView), invoices: page.items.map(invoiceView) };
    }
}
