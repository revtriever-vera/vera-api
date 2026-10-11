import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { z } from 'zod';
import { DateUtil } from '../../../shared/utils/date.util';
import { decimalStringOf } from '../../../shared/utils/decimal.util';
import { marketDataConfig } from '../config/market-data.config';
import { ProviderError } from '../domain/market-data.errors';
import { PTAX_SOURCE, RATE_LOOKBACK_DAYS, SUPPORTED_RATE_CURRENCIES } from '../domain/market-data.types';
import { ExchangeRatePort, FetchedRate } from '../ports/exchange-rate.port';
import { PtaxResponse, ptaxResponseSchema } from '../validation/market-data.schemas';
import { requestJson } from './provider-http';

function odataDateOf(isoDate: string): string {
    const [year, month, day] = isoDate.split('-');
    return `${month ?? ''}-${day ?? ''}-${year ?? ''}`;
}

@Injectable()
export class BcbPtaxDriver extends ExchangeRatePort {
    public constructor(@Inject(marketDataConfig.KEY) private readonly config: ConfigType<typeof marketDataConfig>) {
        super();
    }

    public async fetch(currency: string, date: Date): Promise<FetchedRate | null> {
        if (!SUPPORTED_RATE_CURRENCIES.includes(currency)) {
            return null;
        }
        const today: string = DateUtil.localDateIn(DateUtil.BRAZIL_TIMEZONE, date);
        for (let back: number = 0; back <= RATE_LOOKBACK_DAYS; back += 1) {
            const day: string = DateUtil.onlyDateString(DateUtil.addDays(new Date(`${today}T00:00:00Z`), -back));
            const rate: string | null = await this.sellRateOn(day);
            if (rate !== null) {
                return { currency, date: day, brlPerUnit: rate, source: PTAX_SOURCE };
            }
        }
        return null;
    }

    private async sellRateOn(isoDate: string): Promise<string | null> {
        const url: string = `${this.config.BCB_PTAX_BASE_URL}/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${odataDateOf(isoDate)}'&$top=1&$format=json&$select=cotacaoVenda`;
        const body: unknown = await requestJson(url, {}, this.config.MARKET_DATA_HTTP_TIMEOUT_MS);
        const parsed: z.SafeParseReturnType<unknown, PtaxResponse> = ptaxResponseSchema.safeParse(body);
        if (!parsed.success) {
            throw ProviderError.formatInvalid();
        }
        const first: PtaxResponse['value'][number] | undefined = parsed.data.value[0];
        return first === undefined || first.cotacaoVenda <= 0 ? null : decimalStringOf(first.cotacaoVenda);
    }
}
