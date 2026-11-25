import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { DateUtil } from '../../../shared/utils/date.util';
import { marketDataConfig } from '../config/market-data.config';
import { MarketIndexDomain } from '../domain/market-index.domain';
import {
    MARKET_INDEX_INCREMENTAL_MAX_GAP_DAYS,
    MARKET_INDEX_INCREMENTAL_RANGE,
    MARKET_INDEX_SYMBOLS,
    MarketIndexClose,
    MarketIndexRange,
    MarketIndexSymbol,
    QUOTE_PROVIDER_IDS
} from '../domain/market-data.types';
import { MarketIndexSourcePort } from '../ports/market-index-source.port';
import { MarketDataLogService } from './market-data-log.service';
import { MarketDataMetricsService } from './market-data-metrics.service';
import { ProviderBudgetService } from './provider-budget.service';

const DAY_MS: number = 86_400_000;
const SYMBOLS: readonly MarketIndexSymbol[] = [MARKET_INDEX_SYMBOLS.ibovespa];

function gapInDays(from: string, to: string): number {
    return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

@Injectable()
export class MarketIndexSyncService {
    public constructor(
        @Inject(marketDataConfig.KEY) private readonly config: ConfigType<typeof marketDataConfig>,
        private readonly source: MarketIndexSourcePort,
        private readonly indexes: MarketIndexDomain,
        private readonly budget: ProviderBudgetService,
        private readonly logs: MarketDataLogService,
        private readonly metrics: MarketDataMetricsService
    ) {}

    public async syncAll(now: Date = new Date()): Promise<void> {
        for (const symbol of SYMBOLS) {
            await this.sync(symbol, now);
        }
    }

    private async sync(symbol: MarketIndexSymbol, now: Date): Promise<void> {
        if (!this.source.configured) {
            this.logs.indexNotConfigured(symbol);
            return;
        }
        const today: string = DateUtil.todayInBrazil(now);
        const last: string | null = await this.indexes.lastDate(symbol);
        const range: MarketIndexRange = this.rangeFor(last, today);
        if (!(await this.budget.reserve(QUOTE_PROVIDER_IDS.brapi, 1, now))) {
            return;
        }
        await this.fetchAndStore(symbol, range, today);
    }

    private rangeFor(last: string | null, today: string): MarketIndexRange {
        const incremental: boolean = last !== null && gapInDays(last, today) <= MARKET_INDEX_INCREMENTAL_MAX_GAP_DAYS;
        return incremental ? MARKET_INDEX_INCREMENTAL_RANGE : this.config.BRAPI_INDEX_HISTORY_RANGE;
    }

    private async fetchAndStore(symbol: MarketIndexSymbol, range: MarketIndexRange, today: string): Promise<void> {
        try {
            const fetched: MarketIndexClose[] = await this.source.fetchDaily(symbol, range);
            const closed: MarketIndexClose[] = fetched.filter((point: MarketIndexClose): boolean => point.date < today);
            const stored: number = await this.indexes.save(symbol, this.source.source, closed);
            this.logs.indexStored(symbol, range, stored);
            const newest: string | null = await this.indexes.lastDate(symbol);
            this.metrics.indexAge(symbol, newest === null ? 0 : Math.max(gapInDays(newest, today), 0));
        } catch (error: unknown) {
            this.logs.indexFailed(symbol, error);
        }
    }
}
