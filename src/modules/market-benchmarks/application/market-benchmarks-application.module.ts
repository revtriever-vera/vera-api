import { Module } from '@nestjs/common';
import { CatalogApplicationModule } from '../../catalog/application/catalog-application.module';
import { FixedIncomeScheduleApplicationModule } from '../../fixed-income-schedule/application/fixed-income-schedule-application.module';
import { FixedIncomeServicesModule } from '../../fixed-income/services/fixed-income-services.module';
import { MarketDataApplicationModule } from '../../market-data/application/market-data-application.module';
import { AssetLookupService } from '../services/asset-lookup.service';
import { BenchmarkService } from '../services/benchmark.service';
import { FixedIncomeBenchmarkService } from '../services/fixed-income-benchmark.service';
import { FundPerformanceService } from '../services/fund-performance.service';

@Module({
    imports: [CatalogApplicationModule, FixedIncomeScheduleApplicationModule, FixedIncomeServicesModule, MarketDataApplicationModule],
    providers: [AssetLookupService, BenchmarkService, FixedIncomeBenchmarkService, FundPerformanceService],
    exports: [AssetLookupService, BenchmarkService, FixedIncomeBenchmarkService, FundPerformanceService]
})
export class MarketBenchmarksApplicationModule {}
