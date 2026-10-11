import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { AssetQuotesRepository } from './asset-quotes.repository';
import { ExchangeRatesRepository } from './exchange-rates.repository';
import { ProviderUsageRepository } from './provider-usage.repository';
import { QuoteFetchFailuresRepository } from './quote-fetch-failures.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [AssetQuotesRepository, ExchangeRatesRepository, QuoteFetchFailuresRepository, ProviderUsageRepository],
    exports: [AssetQuotesRepository, ExchangeRatesRepository, QuoteFetchFailuresRepository, ProviderUsageRepository]
})
export class MarketDataRepositoryModule {}
