import { Injectable } from '@nestjs/common';
import { BillingEngineRejectedError } from '../domain/billing-engine.errors';
import { BillingPendingCancellationDomain } from '../domain/billing-pending-cancellation.domain';
import { BillingPendingCancellation, SWEEP_BATCH } from '../domain/billing.types';
import { BillingEnginePort } from '../ports/billing-engine.port';

@Injectable()
export class BillingPendingCancellationService {
    public constructor(
        private readonly engine: BillingEnginePort,
        private readonly pending: BillingPendingCancellationDomain
    ) {}

    public async retryAll(): Promise<number> {
        const items: BillingPendingCancellation[] = await this.pending.list(SWEEP_BATCH);
        for (const item of items) {
            await this.retryOne(item);
        }
        return items.length;
    }

    private async retryOne(item: BillingPendingCancellation): Promise<void> {
        try {
            await this.engine.cancelSubscription(item.engineSubscriptionId, `vera-cancel-${item.engineSubscriptionId}`);
            await this.pending.resolve(item.id);
        } catch (error: unknown) {
            if (error instanceof BillingEngineRejectedError) {
                await this.pending.resolve(item.id);
            }
        }
    }
}
