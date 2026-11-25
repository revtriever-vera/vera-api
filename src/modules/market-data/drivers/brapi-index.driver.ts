import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { z } from 'zod';
import { DateUtil } from '../../../shared/utils/date.util';
import { decimalStringOf } from '../../../shared/utils/decimal.util';
import { marketDataConfig } from '../config/market-data.config';
import { ProviderError } from '../domain/market-data.errors';
import {
    FAILURE_REASONS,
    FAILURE_STAGES,
    MARKET_INDEX_SOURCES,
    MarketIndexClose,
    MarketIndexRange,
    MarketIndexSymbol
} from '../domain/market-data.types';
import { MarketIndexSourcePort } from '../ports/market-index-source.port';
import { BrapiHistoryResponse, brapiHistoryResponseSchema } from '../validation/market-data.schemas';
import { requestJson } from './provider-http';

const MS_PER_SECOND: number = 1000;

type HistoryPoint = NonNullable<BrapiHistoryResponse['results'][number]['historicalDataPrice']>[number];

@Injectable()
export class BrapiIndexDriver extends MarketIndexSourcePort {
    public readonly source: string = MARKET_INDEX_SOURCES.brapi;

    public constructor(@Inject(marketDataConfig.KEY) private readonly config: ConfigType<typeof marketDataConfig>) {
        super();
    }

    public get configured(): boolean {
        return this.config.BRAPI_TOKEN !== undefined;
    }

    public async fetchDaily(symbol: MarketIndexSymbol, range: MarketIndexRange): Promise<MarketIndexClose[]> {
        const token: string | undefined = this.config.BRAPI_TOKEN;
        if (token === undefined) {
            throw new ProviderError(FAILURE_STAGES.request, FAILURE_REASONS.rejected);
        }
        const body: unknown = await requestJson(
            `${this.config.BRAPI_BASE_URL}/quote/${encodeURIComponent(symbol)}?range=${range}&interval=1d`,
            { Authorization: `Bearer ${token}` },
            this.config.MARKET_DATA_HTTP_TIMEOUT_MS
        );
        const parsed: z.SafeParseReturnType<unknown, BrapiHistoryResponse> = brapiHistoryResponseSchema.safeParse(body);
        if (!parsed.success) {
            throw ProviderError.formatInvalid();
        }
        const history: HistoryPoint[] = parsed.data.results.find((result) => result.symbol === symbol)?.historicalDataPrice ?? [];
        return history.flatMap((point: HistoryPoint): MarketIndexClose[] => this.closeOf(point));
    }

    private closeOf(point: HistoryPoint): MarketIndexClose[] {
        if (point.close === null || point.close === undefined) {
            return [];
        }
        const date: string = DateUtil.localDateIn(DateUtil.BRAZIL_TIMEZONE, new Date(point.date * MS_PER_SECOND));
        return [{ date, close: decimalStringOf(point.close) }];
    }
}
