import { Module } from '@nestjs/common';
import { FixedIncomeServicesModule } from '../../fixed-income/services/fixed-income-services.module';
import { MarketDataApplicationModule } from '../../market-data/application/market-data-application.module';
import { BenchmarkService } from '../services/benchmark.service';

@Module({
    imports: [FixedIncomeServicesModule, MarketDataApplicationModule],
    providers: [BenchmarkService],
    exports: [BenchmarkService]
})
export class MarketBenchmarksApplicationModule {}
