import { Injectable } from '@nestjs/common';
import { DateUtil } from '../../../shared/utils/date.util';
import { decimalStringOf } from '../../../shared/utils/decimal.util';
import { ExchangeRateDomain } from '../domain/exchange-rate.domain';
import { BASE_CURRENCY, StoredRate } from '../domain/market-data.types';

export type { StoredRate };

export const BUILTIN_SOURCE: string = 'builtin';

@Injectable()
export class ExchangeRateReaderService {
    public constructor(private readonly rates: ExchangeRateDomain) {}

    public async latest(currency: string, onOrBefore: Date): Promise<StoredRate | null> {
        const day: string = DateUtil.localDateIn(DateUtil.BRAZIL_TIMEZONE, onOrBefore);
        if (currency === BASE_CURRENCY) {
            return { currency, brlPerUnit: '1', date: day, source: BUILTIN_SOURCE };
        }
        const stored: StoredRate | null = await this.rates.latestOnOrBefore(currency, day);
        return stored === null ? null : { ...stored, brlPerUnit: decimalStringOf(stored.brlPerUnit) };
    }
}
