import { Injectable } from '@nestjs/common';
import { DateUtil } from '../../../shared/utils/date.util';
import { MOCK_SOURCE, SUPPORTED_RATE_CURRENCIES } from '../domain/market-data.types';
import { ExchangeRatePort, FetchedRate } from '../ports/exchange-rate.port';

export const MOCK_USD_RATE: string = '5.42';

@Injectable()
export class MockExchangeRateDriver extends ExchangeRatePort {
    public fetch(currency: string, date: Date): Promise<FetchedRate | null> {
        if (!SUPPORTED_RATE_CURRENCIES.includes(currency)) {
            return Promise.resolve(null);
        }
        return Promise.resolve({
            currency,
            date: DateUtil.localDateIn(DateUtil.BRAZIL_TIMEZONE, date),
            brlPerUnit: MOCK_USD_RATE,
            source: MOCK_SOURCE
        });
    }
}
