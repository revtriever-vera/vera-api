import { describe, expect, it } from 'vitest';
import { BillingInvoice, BillingSubscription } from './billing.types';
import { graceEndOf, oldestOverdueInvoice, standingTransitionOf } from './company-billing-standing.rules';

const NOW: Date = new Date('2026-11-10T12:00:00Z');
const GRACE_DAYS: number = 3;

function invoice(overrides: Partial<BillingInvoice>): BillingInvoice {
    return {
        id: 'inv-1',
        companyId: 'company-1',
        subscriptionId: 'sub-1',
        engine: 'fake',
        engineInvoiceId: 'e-inv-1',
        status: 'issued',
        totalCents: '1490',
        method: 'pix',
        dueDate: new Date('2026-11-01T00:00:00Z'),
        cycleStart: null,
        cycleEnd: null,
        issuedAt: null,
        paidAt: null,
        overdueAt: null,
        chargeFailedAt: null,
        createdAt: NOW,
        updatedAt: NOW,
        ...overrides
    };
}

function subscription(overrides: Partial<BillingSubscription>): BillingSubscription {
    return {
        id: 'sub-1',
        companyId: 'company-1',
        engine: 'fake',
        status: 'active',
        engineSubscriptionId: 'e-sub-1',
        engineCustomerId: null,
        planId: 'plan',
        paymentMethod: 'pix',
        firstChargeDate: null,
        chargeDay: null,
        paidThrough: new Date('2026-12-01T00:00:00Z'),
        firstPaidAt: null,
        cancelRequestedAt: null,
        canceledAt: null,
        cardBrand: null,
        cardLast4: null,
        trialEndsAt: null,
        trialStartedAt: null,
        discountRules: [],
        discountCycleOffset: 0,
        createdAt: NOW,
        updatedAt: NOW,
        ...overrides
    };
}

describe('standingTransitionOf', () => {
    it('sem fatura vencida a situação é ativa', () => {
        expect(standingTransitionOf([invoice({})], subscription({}), NOW, GRACE_DAYS)).toEqual({
            status: 'active',
            reason: 'invoice_paid'
        });
    });

    it('fatura vencida dentro da carência é past_due', () => {
        const overdue: BillingInvoice = invoice({ status: 'overdue', overdueAt: new Date('2026-11-08T12:00:01Z') });

        expect(standingTransitionOf([overdue], subscription({}), NOW, GRACE_DAYS)).toEqual({
            status: 'past_due',
            reason: 'invoice_overdue'
        });
    });

    it('no instante exato do fim da carência passa a expired', () => {
        const overdue: BillingInvoice = invoice({ status: 'overdue', overdueAt: new Date('2026-11-07T12:00:00Z') });

        expect(standingTransitionOf([overdue], subscription({}), NOW, GRACE_DAYS)).toEqual({ status: 'expired', reason: 'grace_expired' });
    });

    it('usa a fatura mais antiga em aberto e cai no vencimento quando não há data de atraso', () => {
        const recent: BillingInvoice = invoice({ id: 'recent', status: 'overdue', overdueAt: new Date('2026-11-09T00:00:00Z') });
        const oldest: BillingInvoice = invoice({
            id: 'oldest',
            status: 'overdue',
            overdueAt: null,
            dueDate: new Date('2026-11-01T00:00:00Z')
        });

        expect(oldestOverdueInvoice([recent, oldest])?.id).toBe('oldest');
        expect(standingTransitionOf([recent, oldest], subscription({}), NOW, GRACE_DAYS).status).toBe('expired');
        expect(graceEndOf(new Date('2026-11-01T00:00:00Z'), GRACE_DAYS).toISOString()).toBe('2026-11-04T00:00:00.000Z');
    });

    it('assinatura cancelada vale até o paidThrough e expira depois dele', () => {
        const before: BillingSubscription = subscription({ status: 'canceled', paidThrough: new Date('2026-11-10T12:00:01Z') });
        const after: BillingSubscription = subscription({ status: 'canceled', paidThrough: new Date('2026-11-10T11:59:59Z') });

        expect(standingTransitionOf([], before, NOW, GRACE_DAYS).status).toBe('active');
        expect(standingTransitionOf([], after, NOW, GRACE_DAYS)).toEqual({ status: 'expired', reason: 'canceled_period_ended' });
    });

    it('pagar a fatura depois do expired volta a situação para ativa', () => {
        const paid: BillingInvoice = invoice({ status: 'paid', paidAt: NOW });

        expect(standingTransitionOf([paid], subscription({}), NOW, GRACE_DAYS).status).toBe('active');
    });

    describe('teste com cartão', () => {
        const TRIAL_END: Date = new Date('2026-11-17T03:00:00Z');
        const running = (overrides: Partial<BillingSubscription> = {}): BillingSubscription =>
            subscription({ paidThrough: null, trialEndsAt: TRIAL_END, trialStartedAt: new Date('2026-11-10T00:00:00Z'), ...overrides });

        it('com o cartão confirmado e a primeira cobrança no futuro é trialing', () => {
            expect(standingTransitionOf([], running(), NOW, GRACE_DAYS)).toEqual({ status: 'trialing', reason: 'trial_started' });
        });

        it('antes de o cartão ser confirmado a situação ainda é ativa', () => {
            expect(standingTransitionOf([], running({ trialStartedAt: null }), NOW, GRACE_DAYS).status).toBe('active');
        });

        it('a fatura do ciclo 1 paga leva a active', () => {
            const paid: BillingInvoice = invoice({ status: 'paid', paidAt: NOW });

            expect(standingTransitionOf([paid], running({ firstPaidAt: NOW }), NOW, GRACE_DAYS).status).toBe('active');
        });

        it('a primeira fatura vencida em aberto leva a past_due e depois a expired na carência', () => {
            const overdue: BillingInvoice = invoice({ status: 'overdue', overdueAt: new Date('2026-11-09T00:00:00Z') });
            const late: Date = new Date('2026-11-20T00:00:00Z');

            expect(
                standingTransitionOf([overdue], running({ trialEndsAt: new Date('2026-11-09T00:00:00Z') }), NOW, GRACE_DAYS).status
            ).toBe('past_due');
            expect(standingTransitionOf([overdue], running({ trialEndsAt: new Date('2026-11-09T00:00:00Z') }), late, GRACE_DAYS)).toEqual({
                status: 'expired',
                reason: 'grace_expired'
            });
        });

        it('cancelada no teste segue trialing até trialEndsAt e expira depois com trial_canceled', () => {
            const canceled: BillingSubscription = running({ status: 'canceled' });

            expect(standingTransitionOf([], canceled, NOW, GRACE_DAYS).status).toBe('trialing');
            expect(standingTransitionOf([], canceled, TRIAL_END, GRACE_DAYS)).toEqual({ status: 'expired', reason: 'trial_canceled' });
        });

        it('depois de trialEndsAt sem pagamento nem fatura vencida a situação volta a ser ativa', () => {
            expect(standingTransitionOf([], running(), new Date('2026-11-18T00:00:00Z'), GRACE_DAYS).status).toBe('active');
        });
    });
});
