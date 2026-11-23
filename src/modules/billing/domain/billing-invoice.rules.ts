import { BillingInvoice, INVOICE_STATUSES, InvoiceMirror, InvoiceRowStatus } from './billing.types';

const RANK: Readonly<Record<InvoiceRowStatus, number>> = {
    [INVOICE_STATUSES.issued]: 1,
    [INVOICE_STATUSES.overdue]: 2,
    [INVOICE_STATUSES.paid]: 3
};

export function isInvoiceStatus(value: string): value is InvoiceRowStatus {
    return value === INVOICE_STATUSES.issued || value === INVOICE_STATUSES.overdue || value === INVOICE_STATUSES.paid;
}

export function advancedInvoiceStatus(current: InvoiceRowStatus, incoming: InvoiceRowStatus): InvoiceRowStatus {
    return RANK[incoming] > RANK[current] ? incoming : current;
}

export function isOpenInvoiceStatus(status: string): boolean {
    return status === INVOICE_STATUSES.issued || status === INVOICE_STATUSES.overdue;
}

export function addMonthsUtc(date: Date, months: number): Date {
    const result: Date = new Date(date);
    const day: number = result.getUTCDate();
    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() + months);
    const lastDay: number = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
    result.setUTCDate(Math.min(day, lastDay));
    return result;
}

function methodOfRow(value: string | null): 'card' | 'pix' | null {
    return value === 'card' || value === 'pix' ? value : null;
}

function totalOfRow(value: string | null): number | null {
    return value === null ? null : Number(value);
}

export function mergedMirror(existing: BillingInvoice, incoming: InvoiceMirror): InvoiceMirror {
    const current: InvoiceRowStatus = isInvoiceStatus(existing.status) ? existing.status : INVOICE_STATUSES.issued;
    return {
        engineInvoiceId: existing.engineInvoiceId,
        status: advancedInvoiceStatus(current, incoming.status),
        totalCents: incoming.totalCents ?? totalOfRow(existing.totalCents),
        method: incoming.method ?? methodOfRow(existing.method),
        dueDate: incoming.dueDate ?? existing.dueDate,
        cycleStart: existing.cycleStart ?? incoming.cycleStart,
        cycleEnd: existing.cycleEnd ?? incoming.cycleEnd,
        issuedAt: existing.issuedAt ?? incoming.issuedAt,
        paidAt: existing.paidAt ?? incoming.paidAt,
        overdueAt: existing.overdueAt ?? incoming.overdueAt
    };
}
