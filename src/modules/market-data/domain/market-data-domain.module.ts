import { Module } from '@nestjs/common';
import { MarketDataRepositoryModule } from '../repositories/market-data-repository.module';
import { AssetQuoteDomain } from './asset-quote.domain';
import { ExchangeRateDomain } from './exchange-rate.domain';
import { ProviderUsageDomain } from './provider-usage.domain';
import { QuoteFetchFailureDomain } from './quote-fetch-failure.domain';

@Module({
    imports: [MarketDataRepositoryModule],
    providers: [AssetQuoteDomain, ExchangeRateDomain, QuoteFetchFailureDomain, ProviderUsageDomain],
    exports: [AssetQuoteDomain, ExchangeRateDomain, QuoteFetchFailureDomain, ProviderUsageDomain]
})
export class MarketDataDomainModule {}
