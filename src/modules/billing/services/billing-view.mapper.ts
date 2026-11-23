import { Injectable } from '@nestjs/common';
import { BillingInvoice, InvoicePage } from '../domain/billing.types';
import { InvoicesPageView } from '../validation/billing-http.schemas';

function iso(date: Date | null): string | null {
    return date === null ? null : date.toISOString();
}

@Injectable()
export class BillingViewMapper {
    public invoicesPage(page: InvoicePage): InvoicesPageView {
        return {
            items: page.items.map((invoice: BillingInvoice) => ({
                id: invoice.id,
                cycleStart: iso(invoice.cycleStart),
                cycleEnd: iso(invoice.cycleEnd),
                totalCents: invoice.totalCents === null ? null : Number(invoice.totalCents),
                method: invoice.method === 'card' || invoice.method === 'pix' ? invoice.method : null,
                status: invoice.status === 'paid' || invoice.status === 'overdue' ? invoice.status : 'issued',
                dueDate: iso(invoice.dueDate),
                paidAt: iso(invoice.paidAt)
            })),
            page: page.page,
            total: page.total
        };
    }
}
