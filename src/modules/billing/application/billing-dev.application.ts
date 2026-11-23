import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { billingConfig } from '../config/billing.config';
import { BillingDevPageNotFoundError } from '../domain/billing-engine.errors';
import { FakeAdvanceAction, FakeBillingEngineDriver } from '../drivers/fake-billing-engine.driver';

const CARD_PARAM: string = 'card';
const CARD_SAVED: string = 'saved';

function withCardSaved(returnUrl: string): string {
    const url: URL = new URL(returnUrl);
    url.searchParams.set(CARD_PARAM, CARD_SAVED);
    return url.toString();
}

@Injectable()
export class BillingDevApplication {
    public constructor(
        @Inject(billingConfig.KEY) private readonly config: ConfigType<typeof billingConfig>,
        private readonly fake: FakeBillingEngineDriver
    ) {}

    public async saveTestCard(token: string, last4?: string): Promise<string> {
        this.assertEnabled();
        const returnUrl: string | null = await this.fake.saveTestCard(token, last4);
        if (returnUrl === null) {
            throw new BillingDevPageNotFoundError();
        }
        return withCardSaved(returnUrl);
    }

    public async payInvoice(invoiceId: string): Promise<void> {
        this.assertEnabled();
        if (!(await this.fake.payInvoice(invoiceId))) {
            throw new BillingDevPageNotFoundError();
        }
    }

    public async advance(subscriptionId: string, action: FakeAdvanceAction): Promise<void> {
        this.assertEnabled();
        if (!(await this.fake.advance(subscriptionId, action))) {
            throw new BillingDevPageNotFoundError();
        }
    }

    private assertEnabled(): void {
        if (!this.config.IS_LOCAL || this.config.BILLING_ENGINE_DRIVER !== 'fake') {
            throw new BillingDevPageNotFoundError();
        }
    }
}
