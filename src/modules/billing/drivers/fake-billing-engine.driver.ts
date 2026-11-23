import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { billingConfig } from '../config/billing.config';
import { BillingEngineRejectedError, BillingEngineUnavailableError } from '../domain/billing-engine.errors';
import {
    BillingEngine,
    CardCaptureSession,
    CreateSubscriptionInput,
    EngineEvent,
    EngineEventPage,
    EngineInvoice,
    EnginePage,
    EngineSubscription,
    OpenInvoiceStatus,
    PaymentLink,
    SavedCard
} from '../domain/billing-engine.types';
import { BillingEnginePort } from '../ports/billing-engine.port';
import { FakeEventDelivery } from './fake-event-delivery.service';

export const FAKE_PRICE_CENTS: number = 1490;
export const FAKE_TEST_CARD: SavedCard = { brand: 'visa', last4: '4242' };

const HTTP_NOT_FOUND: number = 404;
const CAPTURE_TTL_MS: number = 30 * 60 * 1000;
const PAGE_SIZE: number = 50;
const CYCLE_DAYS: number = 30;
const MS_PER_DAY: number = 24 * 60 * 60 * 1000;

interface CaptureToken {
    readonly subscriptionId: string;
    readonly returnUrl: string;
    readonly expiresAt: number;
}

function notFound(): BillingEngineRejectedError {
    return new BillingEngineRejectedError(HTTP_NOT_FOUND, 'engine.not_found');
}

function dateOnly(date: Date): string {
    return date.toISOString().slice(0, 10);
}

@Injectable()
export class FakeBillingEngineDriver extends BillingEnginePort {
    public readonly engine: BillingEngine = 'fake';
    private readonly subscriptions: Map<string, EngineSubscription> = new Map<string, EngineSubscription>();
    private readonly customers: Map<string, string> = new Map<string, string>();
    private readonly created: Map<string, string> = new Map<string, string>();
    private readonly canceled: Map<string, string> = new Map<string, string>();
    private readonly invoices: Map<string, EngineInvoice> = new Map<string, EngineInvoice>();
    private readonly cards: Map<string, SavedCard> = new Map<string, SavedCard>();
    private readonly captures: Map<string, CaptureToken> = new Map<string, CaptureToken>();
    private readonly events: EngineEvent[] = [];
    private readonly captureSessions: Map<string, CardCaptureSession> = new Map<string, CardCaptureSession>();
    private sequence: number = 0;

    public constructor(
        @Inject(billingConfig.KEY) private readonly config: ConfigType<typeof billingConfig>,
        private readonly delivery: FakeEventDelivery
    ) {
        super();
    }

    public async createSubscription(input: CreateSubscriptionInput): Promise<EngineSubscription> {
        this.assertAvailable();
        const known: string | undefined = this.created.get(input.idempotencyKey);
        if (known !== undefined) {
            return this.subscriptionById(known);
        }
        const subscription: EngineSubscription = {
            id: this.nextId('sub'),
            status: 'pending',
            planId: input.planId,
            customerId: this.customerOf(input.customer.externalRef),
            paymentMethod: input.paymentMethod,
            firstChargeDate: input.firstChargeDate ?? null,
            canceledAt: null
        };
        this.subscriptions.set(subscription.id, subscription);
        this.created.set(input.idempotencyKey, subscription.id);
        await this.emit('subscription.created', subscription.id, {});
        if (input.paymentMethod === 'pix') {
            await this.issueInvoice(subscription.id);
        }
        return subscription;
    }

    public async subscriptionOf(id: string): Promise<EngineSubscription> {
        this.assertAvailable();
        return this.subscriptionById(id);
    }

    public async cancelSubscription(id: string, idempotencyKey: string): Promise<EngineSubscription> {
        this.assertAvailable();
        const known: string | undefined = this.canceled.get(idempotencyKey);
        const current: EngineSubscription = this.subscriptionById(id);
        if (known !== undefined || current.status === 'canceled') {
            return current;
        }
        const next: EngineSubscription = { ...current, status: 'canceled', canceledAt: new Date().toISOString() };
        this.subscriptions.set(id, next);
        this.canceled.set(idempotencyKey, id);
        await this.emit('subscription.canceled', id, {});
        return next;
    }

    public async createCardCaptureSession(subscriptionId: string, returnUrl: string, idempotencyKey: string): Promise<CardCaptureSession> {
        this.assertAvailable();
        this.subscriptionById(subscriptionId);
        const repeated: CardCaptureSession | undefined = this.captureSessions.get(idempotencyKey);
        if (repeated !== undefined) {
            return repeated;
        }
        const token: string = randomUUID();
        const expiresAt: number = Date.now() + CAPTURE_TTL_MS;
        this.captures.set(token, { subscriptionId, returnUrl, expiresAt });
        const session: CardCaptureSession = {
            captureUrl: `${this.config.FAKE_BILLING_PUBLIC_URL}/billing/_dev/capture/${token}`,
            expiresAt: new Date(expiresAt).toISOString()
        };
        this.captureSessions.set(idempotencyKey, session);
        return session;
    }

    public async savedCardOf(subscriptionId: string): Promise<SavedCard | null> {
        this.assertAvailable();
        this.subscriptionById(subscriptionId);
        return this.cards.get(subscriptionId) ?? null;
    }

    public async invoiceOf(id: string): Promise<EngineInvoice> {
        this.assertAvailable();
        return this.invoiceById(id);
    }

    public async invoicesWithStatus(status: OpenInvoiceStatus, page: number): Promise<EnginePage<EngineInvoice>> {
        this.assertAvailable();
        const matching: EngineInvoice[] = [...this.invoices.values()].filter(
            (invoice: EngineInvoice): boolean => invoice.status === status
        );
        const start: number = (page - 1) * PAGE_SIZE;
        return { items: matching.slice(start, start + PAGE_SIZE), page, pageSize: PAGE_SIZE, total: matching.length };
    }

    public async invoicePaymentLinkOf(id: string): Promise<PaymentLink> {
        this.assertAvailable();
        this.invoiceById(id);
        return { url: `${this.config.FAKE_BILLING_PUBLIC_URL}/billing/_dev/pay/${encodeURIComponent(id)}`, kind: 'payment_page' };
    }

    public async retryInvoicePricing(id: string): Promise<void> {
        this.assertAvailable();
        this.invoiceById(id);
    }

    public async eventsAfter(cursor: string | null, limit: number): Promise<EngineEventPage> {
        this.assertAvailable();
        const start: number = cursor === null ? 0 : Number.parseInt(cursor, 10);
        const items: EngineEvent[] = this.events.slice(start, start + limit);
        const end: number = start + items.length;
        return { items, next: end < this.events.length ? String(end) : null };
    }

    public captureOf(token: string): CaptureToken | null {
        const capture: CaptureToken | undefined = this.captures.get(token);
        return capture === undefined || capture.expiresAt < Date.now() ? null : capture;
    }

    public async saveTestCard(token: string): Promise<string | null> {
        const capture: CaptureToken | null = this.captureOf(token);
        if (capture === null) {
            return null;
        }
        this.captures.delete(token);
        this.cards.set(capture.subscriptionId, FAKE_TEST_CARD);
        await this.emit('subscription.card_saved', capture.subscriptionId, { brand: FAKE_TEST_CARD.brand, last4: FAKE_TEST_CARD.last4 });
        await this.chargeAfterCard(capture.subscriptionId);
        return capture.returnUrl;
    }

    public async payInvoice(id: string): Promise<boolean> {
        const invoice: EngineInvoice | undefined = this.invoices.get(id);
        if (invoice === undefined) {
            return false;
        }
        if (invoice.status !== 'paid') {
            this.invoices.set(id, { ...invoice, status: 'paid', paidAt: new Date().toISOString() });
            await this.emit('invoice.paid', invoice.subscriptionId, { invoiceId: id });
            this.activate(invoice.subscriptionId);
        }
        return true;
    }

    private async chargeAfterCard(subscriptionId: string): Promise<void> {
        const invoice: EngineInvoice = await this.issueInvoice(subscriptionId);
        await this.payInvoice(invoice.id);
    }

    private async issueInvoice(subscriptionId: string): Promise<EngineInvoice> {
        const subscription: EngineSubscription = this.subscriptionById(subscriptionId);
        const now: Date = new Date();
        const invoice: EngineInvoice = {
            id: this.nextId('inv'),
            subscriptionId,
            status: 'issued',
            totalCents: FAKE_PRICE_CENTS,
            method: subscription.paymentMethod,
            dueDate: dateOnly(now),
            cycleStart: dateOnly(now),
            cycleEnd: dateOnly(new Date(now.getTime() + CYCLE_DAYS * MS_PER_DAY)),
            issuedAt: now.toISOString(),
            paidAt: null,
            overdueAt: null
        };
        this.invoices.set(invoice.id, invoice);
        await this.emit('invoice.issued', subscriptionId, { invoiceId: invoice.id, totalCents: invoice.totalCents });
        return invoice;
    }

    private activate(subscriptionId: string): void {
        const current: EngineSubscription = this.subscriptionById(subscriptionId);
        if (current.status === 'pending') {
            this.subscriptions.set(subscriptionId, { ...current, status: 'active' });
        }
    }

    private async emit(type: string, subscriptionId: string, data: Readonly<Record<string, unknown>>): Promise<void> {
        const event: EngineEvent = {
            id: this.nextId('evt'),
            type,
            createdAt: new Date().toISOString(),
            data: { ...data, subscriptionId, customerExternalRef: this.externalRefOf(subscriptionId) }
        };
        this.events.push(event);
        await this.delivery.deliver(event);
    }

    private externalRefOf(subscriptionId: string): string | null {
        const customerId: string | null = this.subscriptionById(subscriptionId).customerId;
        const entry: [string, string] | undefined = [...this.customers.entries()].find(
            ([, id]: [string, string]): boolean => id === customerId
        );
        return entry === undefined ? null : entry[0];
    }

    private customerOf(externalRef: string): string {
        const known: string | undefined = this.customers.get(externalRef);
        if (known !== undefined) {
            return known;
        }
        const id: string = this.nextId('cus');
        this.customers.set(externalRef, id);
        return id;
    }

    private subscriptionById(id: string): EngineSubscription {
        const subscription: EngineSubscription | undefined = this.subscriptions.get(id);
        if (subscription === undefined) {
            throw notFound();
        }
        return subscription;
    }

    private invoiceById(id: string): EngineInvoice {
        const invoice: EngineInvoice | undefined = this.invoices.get(id);
        if (invoice === undefined) {
            throw notFound();
        }
        return invoice;
    }

    private assertAvailable(): void {
        if (this.config.FAKE_BILLING_FORCE_FAILURE) {
            throw new BillingEngineUnavailableError('forced_failure', null);
        }
    }

    private nextId(prefix: string): string {
        this.sequence += 1;
        return `fake_${prefix}_${String(this.sequence).padStart(6, '0')}`;
    }
}
