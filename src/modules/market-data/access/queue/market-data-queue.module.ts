import { Module } from '@nestjs/common';
import { MarketDataApplicationModule } from '../../application/market-data-application.module';
import { QuoteOnDemandHandler } from './quote-ondemand.handler';
import { QuotesChunkHandler } from './quotes-chunk.handler';

@Module({
    imports: [MarketDataApplicationModule],
    providers: [QuotesChunkHandler, QuoteOnDemandHandler]
})
export class MarketDataQueueModule {}
