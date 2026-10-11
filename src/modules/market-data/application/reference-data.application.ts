import { Injectable } from '@nestjs/common';
import { DateUtil } from '../../../shared/utils/date.util';
import { AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { ExchangeRateDomain } from '../domain/exchange-rate.domain';
import { QUOTE_GROUPS, QuotableAsset, SUPPORTED_RATE_CURRENCIES } from '../domain/market-data.types';
import { ageInDays } from '../domain/quote-staleness';
import { ExchangeRatePort, FetchedRate } from '../ports/exchange-rate.port';
import { HeldAssetsService } from '../services/held-assets.service';
import { MarketDataLogService } from '../services/market-data-log.service';
import { MarketDataMetricsService } from '../services/market-data-metrics.service';
import { QuoteCollectorService } from '../services/quote-collector.service';

@Injectable()
export class ReferenceDataApplication {
    public constructor(
        private readonly held: HeldAssetsService,
        private readonly catalog: AssetCatalogService,
        private readonly collector: QuoteCollectorService,
        private readonly rates: ExchangeRatePort,
        private readonly exchangeRates: ExchangeRateDomain,
        private readonly metrics: MarketDataMetricsService,
        private readonly logs: MarketDataLogService
    ) {}

    public async handleReference(): Promise<void> {
        await this.refreshTreasuryQuotes();
        await this.refreshRates();
    }

    public async handlePtax(): Promise<void> {
        await this.refreshRates();
    }

    private async refreshTreasuryQuotes(): Promise<void> {
        const assets: QuotableAsset[] = await this.catalog.findManyByIds(await this.held.listHeldAssetIds());
        const bonds: QuotableAsset[] = assets.filter((asset: QuotableAsset): boolean => asset.quotesProvider === QUOTE_GROUPS.tesouro);
        if (bonds.length > 0) {
            await this.collector.collect(QUOTE_GROUPS.tesouro, bonds);
        }
    }

    private async refreshRates(): Promise<void> {
        for (const currency of SUPPORTED_RATE_CURRENCIES) {
            await this.refreshRate(currency);
        }
    }

    private async refreshRate(currency: string): Promise<void> {
        const now: Date = new Date();
        let rate: FetchedRate | null;
        try {
            rate = await this.rates.fetch(currency, now);
        } catch (error: unknown) {
            this.logs.rateFailed(currency, error);
            throw error;
        }
        if (rate === null) {
            this.logs.rateMissing(currency);
            return;
        }
        await this.exchangeRates.save(rate, now);
        this.logs.rateStored(currency, rate.date, rate.source);
        this.metrics.rateAge(currency, ageInDays(rate.date, DateUtil.todayInBrazil(now)));
    }
}
