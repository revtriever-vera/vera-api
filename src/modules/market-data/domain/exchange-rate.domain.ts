import { Injectable } from '@nestjs/common';
import { ExchangeRatesRepository } from '../repositories/exchange-rates.repository';
import { RateWrite, StoredRate } from './market-data.types';

@Injectable()
export class ExchangeRateDomain {
    public constructor(private readonly rates: ExchangeRatesRepository) {}

    public async save(rate: RateWrite, fetchedAt: Date): Promise<void> {
        await this.rates.upsertRate(rate, fetchedAt);
    }

    public async latestOnOrBefore(currency: string, isoDate: string): Promise<StoredRate | null> {
        return this.rates.findLatestOnOrBefore(currency, isoDate);
    }
}
