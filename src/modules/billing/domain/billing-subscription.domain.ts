import { Injectable } from '@nestjs/common';
import { BillingSubscriptionsRepository, ActivationData } from '../repositories/billing-subscriptions.repository';
import { BillingEngine } from './billing-engine.types';
import { BillingSubscription, NewSubscriptionDraft } from './billing.types';

@Injectable()
export class BillingSubscriptionDomain {
    public constructor(private readonly subscriptions: BillingSubscriptionsRepository) {}

    public async reserve(draft: NewSubscriptionDraft): Promise<BillingSubscription | null> {
        return this.subscriptions.reserve(draft);
    }

    public async findOpen(engine: BillingEngine): Promise<BillingSubscription | null> {
        return this.subscriptions.findOpen(engine);
    }

    public async findCurrent(engine: BillingEngine): Promise<BillingSubscription | null> {
        return this.subscriptions.findCurrent(engine);
    }

    public async findById(id: string): Promise<BillingSubscription | null> {
        return this.subscriptions.findById(id);
    }

    public async listByIdsAcrossTenants(ids: readonly string[]): Promise<BillingSubscription[]> {
        return this.subscriptions.listByIdsAcrossTenants(ids);
    }

    public async listOfCompany(): Promise<BillingSubscription[]> {
        return this.subscriptions.listOfCompany();
    }

    public async activate(id: string, data: ActivationData): Promise<BillingSubscription | null> {
        return this.subscriptions.activate(id, data);
    }

    public async fail(id: string): Promise<boolean> {
        return this.subscriptions.fail(id);
    }

    public async carryPaidPeriod(id: string, paidThrough: Date): Promise<void> {
        await this.subscriptions.carryPaidPeriod(id, paidThrough);
    }

    public async saveCard(id: string, brand: string | null, last4: string): Promise<void> {
        await this.subscriptions.saveCard(id, brand, last4);
    }

    public async cancel(current: BillingSubscription, at: Date, endsNow: boolean): Promise<BillingSubscription | null> {
        return this.subscriptions.cancel(current, at, endsNow);
    }

    public async markCanceledByEngine(current: BillingSubscription, at: Date): Promise<void> {
        await this.subscriptions.markCanceledByEngine(current, at);
    }

    public async recordPayment(current: BillingSubscription, paidThrough: Date, paidAt: Date): Promise<void> {
        await this.subscriptions.recordPayment(current, paidThrough, paidAt);
    }

    public async markTrialStarted(id: string, at: Date): Promise<boolean> {
        return this.subscriptions.markTrialStarted(id, at);
    }

    public async listUnconfirmedTrialsAcrossTenants(before: Date, limit: number): Promise<BillingSubscription[]> {
        return this.subscriptions.listUnconfirmedTrialsAcrossTenants(before, limit);
    }

    public async listEndingTrialsAcrossTenants(now: Date, until: Date, limit: number): Promise<BillingSubscription[]> {
        return this.subscriptions.listEndingTrialsAcrossTenants(now, until, limit);
    }

    public async listUnpaidWithFirstChargeAcrossTenants(from: string, until: string, limit: number): Promise<BillingSubscription[]> {
        return this.subscriptions.listUnpaidWithFirstChargeAcrossTenants(from, until, limit);
    }

    public async findByEngineSubscriptionIdAcrossTenants(
        engine: BillingEngine,
        engineSubscriptionId: string
    ): Promise<BillingSubscription | null> {
        return this.subscriptions.findByEngineSubscriptionIdAcrossTenants(engine, engineSubscriptionId);
    }

    public async listStalePendingAcrossTenants(before: Date, limit: number): Promise<BillingSubscription[]> {
        return this.subscriptions.listStalePendingAcrossTenants(before, limit);
    }

    public async companiesWithEndedCancellationAcrossTenants(now: Date, limit: number): Promise<string[]> {
        return this.subscriptions.companiesWithEndedCancellationAcrossTenants(now, limit);
    }
}
