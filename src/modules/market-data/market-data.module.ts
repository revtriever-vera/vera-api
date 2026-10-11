import { Module } from '@nestjs/common';
import { MarketDataCommandModule } from './access/commands/market-data-command.module';
import { MarketDataHttpModule } from './access/http/market-data-http.module';
import { MarketDataQueueModule } from './access/queue/market-data-queue.module';

@Module({
    imports: [MarketDataHttpModule, MarketDataCommandModule, MarketDataQueueModule]
})
export class MarketDataModule {}
