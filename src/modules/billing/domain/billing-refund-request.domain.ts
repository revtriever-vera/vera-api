import { Injectable } from '@nestjs/common';
import { BillingRefundRequestsRepository } from '../repositories/billing-refund-requests.repository';
import { BillingRefundRequest } from './billing.types';

@Injectable()
export class BillingRefundRequestDomain {
    public constructor(private readonly refunds: BillingRefundRequestsRepository) {}

    public async recordOnce(subscriptionId: string, requestedAt: Date): Promise<boolean> {
        return this.refunds.recordOnce(subscriptionId, requestedAt);
    }

    public async listOfCompany(): Promise<BillingRefundRequest[]> {
        return this.refunds.listOfCompany();
    }
}
