import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { marketDataConfig } from '../config/market-data.config';
import { ProviderUsageDomain, WindowReading } from '../domain/provider-usage.domain';
import { BudgetLimits, QuoteProviderId } from '../domain/market-data.types';
import { MarketDataLogService } from './market-data-log.service';
import { MarketDataMetricsService } from './market-data-metrics.service';

@Injectable()
export class ProviderBudgetService {
    public constructor(
        @Inject(marketDataConfig.KEY) private readonly config: ConfigType<typeof marketDataConfig>,
        private readonly usage: ProviderUsageDomain,
        private readonly logs: MarketDataLogService,
        private readonly metrics: MarketDataMetricsService
    ) {}

    public async reserve(provider: QuoteProviderId, calls: number, now: Date = new Date()): Promise<boolean> {
        const limits: BudgetLimits = this.config.LIMITS[provider];
        const readings: WindowReading[] | null = await this.usage.reserve(provider, calls, limits, now);
        if (readings === null) {
            this.logs.budgetRefused(provider, calls);
            return false;
        }
        for (const reading of readings) {
            this.metrics.budgetUsed(provider, reading.window, reading.used / reading.limit);
        }
        return true;
    }

    public async pruneOldUsage(now: Date = new Date()): Promise<void> {
        await this.usage.pruneOld(now);
    }
}
