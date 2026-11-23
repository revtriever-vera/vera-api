import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { AccountDataEraserPort } from '../../identity/services/account-data-eraser.port';
import { BillingPendingCancellationDomain } from '../domain/billing-pending-cancellation.domain';
import { BillingSubscriptionDomain } from '../domain/billing-subscription.domain';
import { BillingSubscription, SUBSCRIPTION_STATUSES } from '../domain/billing.types';
import { BillingEnginePort } from '../ports/billing-engine.port';

export const BILLING_ERASE_AREA: string = 'billing';

@Injectable()
export class BillingAccountEraser extends AccountDataEraserPort {
    public readonly area: string = BILLING_ERASE_AREA;

    public constructor(
        private readonly engine: BillingEnginePort,
        private readonly subscriptions: BillingSubscriptionDomain,
        private readonly pending: BillingPendingCancellationDomain
    ) {
        super();
    }

    @AsCompany()
    public async eraseAll(_companyId: string): Promise<number> {
        const rows: BillingSubscription[] = await this.subscriptions.listOfCompany();
        const live: BillingSubscription[] = rows.filter(
            (row: BillingSubscription): boolean => row.engineSubscriptionId !== null && row.status !== SUBSCRIPTION_STATUSES.failed
        );
        for (const row of live) {
            await this.cancelOrQueue(row);
        }
        return live.length;
    }

    private async cancelOrQueue(row: BillingSubscription): Promise<void> {
        if (row.engineSubscriptionId === null) {
            return;
        }
        try {
            await this.engine.cancelSubscription(row.engineSubscriptionId, `vera-cancel-${row.id}`);
        } catch {
            await this.pending.recordOnce(row.engineSubscriptionId);
        }
    }
}
