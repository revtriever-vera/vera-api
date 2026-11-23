import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';
import { BillingOperation, BillingOutcome } from '../domain/billing-engine.types';

const ENGINE: string = 'billing-engine';
const SUBSCRIPTION: string = 'billing-subscription';
const EVENTS: string = 'billing-events';
const PRICE: string = 'billing-price';
const RECONCILE: string = 'billing-reconcile';

export type SubscriptionLogAction =
    'subscribed' | 'activated' | 'past_due' | 'canceled' | 'ended' | 'resumed' | 'trial_started' | 'trial_unconfirmed_canceled';

export interface EngineCallLog {
    readonly operation: BillingOperation;
    readonly outcome: BillingOutcome;
    readonly latencyMs: number;
    readonly status: number | null;
    readonly problemType: string | null;
}

@Injectable()
export class BillingLogService {
    public constructor(private readonly logService: LogService) {}

    public engineCall(call: EngineCallLog): void {
        this.logService.info({
            message: 'billing engine call',
            identifier: ENGINE,
            meta: {
                operation: call.operation,
                outcome: call.outcome,
                latencyMs: call.latencyMs,
                status: call.status,
                problemType: call.problemType
            }
        });
    }

    public engineUnauthorized(operation: BillingOperation): void {
        this.logService.error({
            message: 'billing engine rejected the api key',
            identifier: ENGINE,
            meta: { operation, status: 401 }
        });
    }

    public fakeDeliveryFailed(eventType: string, reason: string): void {
        this.logService.warn({ message: 'fake billing event not delivered', identifier: ENGINE, meta: { eventType, reason } });
    }

    public subscription(action: SubscriptionLogAction, subscriptionId: string, method: string): void {
        this.logService.info({ message: `subscription ${action}`, identifier: SUBSCRIPTION, meta: { subscriptionId, method } });
    }

    public eventReceived(type: string, eventId: string): void {
        this.logService.info({ message: 'event received', identifier: EVENTS, meta: { type, eventId } });
    }

    public eventIgnored(type: string, eventId: string): void {
        this.logService.info({ message: 'event ignored', identifier: EVENTS, meta: { type, eventId } });
    }

    public eventDeferred(type: string, eventId: string): void {
        this.logService.info({ message: 'event deferred', identifier: EVENTS, meta: { type, eventId } });
    }

    public eventFailed(type: string, eventId: string, reason: string): void {
        this.logService.error({ message: 'event failed', identifier: EVENTS, meta: { type, eventId, reason } });
    }

    public webhookRefused(reason: string): void {
        this.logService.warn({ message: 'event refused', identifier: EVENTS, meta: { reason } });
    }

    public priceQuoted(outcome: 'quoted' | 'skipped' | 'awaiting_card'): void {
        this.logService.info({ message: `price ${outcome}`, identifier: PRICE, meta: { outcome } });
    }

    public reconciled(checked: number, fixed: number, created: number): void {
        this.logService.info({ message: 'invoices reconciled', identifier: RECONCILE, meta: { checked, fixed, created } });
    }
}
