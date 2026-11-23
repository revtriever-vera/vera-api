import { Injectable } from '@nestjs/common';
import { PaymentMethod } from '../domain/billing-engine.types';
import { BillingCancellationService } from '../services/billing-cancellation.service';
import { BillingCardService } from '../services/billing-card.service';
import { BillingCheckoutService, SubscribeResult } from '../services/billing-checkout.service';
import { BillingTrialService } from '../services/billing-trial.service';
import { BillingPendingCancellationService } from '../services/billing-pending-cancellation.service';
import { BillingMeService } from '../../plans/services/billing-me.service';
import { BillingMe } from '../../plans/services/billing-me-contract';

export type { SubscribeResult };

@Injectable()
export class SubscriptionApplication {
    public constructor(
        private readonly checkout: BillingCheckoutService,
        private readonly cancellation: BillingCancellationService,
        private readonly cards: BillingCardService,
        private readonly pending: BillingPendingCancellationService,
        private readonly trials: BillingTrialService,
        private readonly me: BillingMeService
    ) {}

    public async subscribe(method: PaymentMethod): Promise<SubscribeResult> {
        return this.checkout.subscribe(method);
    }

    public async captureSession(): Promise<{ captureUrl: string }> {
        return this.cards.captureSession();
    }

    public async confirmCard(): Promise<BillingMe> {
        await this.cards.confirm();
        return this.me.get();
    }

    public async cancel(): Promise<BillingMe & { endedNow: boolean }> {
        const result: { endedNow: boolean } = await this.cancellation.cancel();
        return { ...(await this.me.get()), endedNow: result.endedNow };
    }

    public async resume(): Promise<BillingMe> {
        await this.checkout.resume();
        return this.me.get();
    }

    public async sweepTrials(): Promise<number> {
        return this.trials.sweep();
    }

    public async rescue(): Promise<number> {
        return (await this.checkout.rescue()) + (await this.pending.retryAll());
    }
}
