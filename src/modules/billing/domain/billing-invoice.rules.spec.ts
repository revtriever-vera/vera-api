import { describe, expect, it } from 'vitest';
import { addMonthsUtc, advancedInvoiceStatus, isInvoiceStatus, isOpenInvoiceStatus, mergedMirror } from './billing-invoice.rules';
import { BillingInvoice, InvoiceMirror } from './billing.types';

const AT: Date = new Date('2026-11-10T00:00:00Z');

function row(overrides: Partial<BillingInvoice>): BillingInvoice {
    return {
        id: 'inv-1',
        companyId: 'company-1',
        subscriptionId: 'sub-1',
        engine: 'fake',
        engineInvoiceId: 'e-inv-1',
        status: 'issued',
        totalCents: '1490',
        method: 'pix',
        dueDate: AT,
        cycleStart: AT,
        cycleEnd: new Date('2026-12-10T00:00:00Z'),
        issuedAt: AT,
        paidAt: null,
        overdueAt: null,
        chargeFailedAt: null,
        createdAt: AT,
        updatedAt: AT,
        ...overrides
    };
}

function mirror(overrides: Partial<InvoiceMirror>): InvoiceMirror {
    return {
        engineInvoiceId: 'e-inv-1',
        status: 'issued',
        totalCents: null,
        method: null,
        dueDate: null,
        cycleStart: new Date('2027-01-01T00:00:00Z'),
        cycleEnd: new Date('2027-02-01T00:00:00Z'),
        issuedAt: null,
        paidAt: null,
        overdueAt: null,
        ...overrides
    };
}

describe('espelho de faturas', () => {
    it('o status só avança: issued < overdue < paid, e paid é final', () => {
        expect(advancedInvoiceStatus('issued', 'overdue')).toBe('overdue');
        expect(advancedInvoiceStatus('overdue', 'issued')).toBe('overdue');
        expect(advancedInvoiceStatus('paid', 'issued')).toBe('paid');
        expect(advancedInvoiceStatus('paid', 'overdue')).toBe('paid');
        expect(advancedInvoiceStatus('issued', 'paid')).toBe('paid');
    });

    it('reconhece os status do espelho e as faturas em aberto', () => {
        expect(isInvoiceStatus('paid')).toBe(true);
        expect(isInvoiceStatus('held')).toBe(false);
        expect(isOpenInvoiceStatus('overdue')).toBe(true);
        expect(isOpenInvoiceStatus('paid')).toBe(false);
    });

    it('um evento atrasado de issued não desfaz o pago nem apaga os campos já conhecidos', () => {
        const merged: InvoiceMirror = mergedMirror(
            row({ status: 'paid', paidAt: AT }),
            mirror({ status: 'issued', totalCents: 1990, method: 'card' })
        );

        expect(merged.status).toBe('paid');
        expect(merged.paidAt).toBe(AT);
        expect(merged.cycleStart).toBe(AT);
        expect(merged.totalCents).toBe(1990);
        expect(merged.method).toBe('card');
    });

    it('mantém o total e a forma do espelho quando o evento não os traz', () => {
        const merged: InvoiceMirror = mergedMirror(row({}), mirror({}));

        expect(merged.totalCents).toBe(1490);
        expect(merged.method).toBe('pix');
    });

    it('soma meses sem passar do fim do mês', () => {
        expect(addMonthsUtc(new Date('2026-01-31T00:00:00Z'), 1).toISOString()).toBe('2026-02-28T00:00:00.000Z');
        expect(addMonthsUtc(new Date('2026-11-10T00:00:00Z'), 1).toISOString()).toBe('2026-12-10T00:00:00.000Z');
    });
});
