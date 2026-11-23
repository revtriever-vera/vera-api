import { Injectable } from '@nestjs/common';
import { BillingPriceQuotesRepository } from '../repositories/billing-price-quotes.repository';
import { BillingPriceQuote, PriceQuoteDraft } from './billing.types';

@Injectable()
export class BillingPriceQuoteDomain {
    public constructor(private readonly quotes: BillingPriceQuotesRepository) {}

    public async quote(draft: PriceQuoteDraft): Promise<BillingPriceQuote> {
        return this.quotes.quote(draft);
    }
}
