import { Injectable } from '@nestjs/common';
import { BillingPendingCancellationsRepository } from '../repositories/billing-pending-cancellations.repository';
import { BillingPendingCancellation } from './billing.types';

@Injectable()
export class BillingPendingCancellationDomain {
    public constructor(private readonly pending: BillingPendingCancellationsRepository) {}

    public async recordOnce(engineSubscriptionId: string): Promise<void> {
        await this.pending.recordOnce(engineSubscriptionId);
    }

    public async list(limit: number): Promise<BillingPendingCancellation[]> {
        return this.pending.list(limit);
    }

    public async resolve(id: string): Promise<void> {
        await this.pending.resolve(id);
    }
}
