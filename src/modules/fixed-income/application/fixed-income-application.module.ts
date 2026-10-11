import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { ContextModule } from '../../../core/context/context.module';
import { QueueModule } from '../../../core/queue/queue.module';
import { ThrottleModule } from '../../../core/throttle/throttle.module';
import { AllocationApplicationModule } from '../../allocation/application/allocation-application.module';
import { fixedIncomeConfig } from '../config/fixed-income.config';
import { FixedIncomeDomainModule } from '../domain/fixed-income-domain.module';
import { BcbSgsSeriesDriver } from '../drivers/bcb-sgs-series.driver';
import { MockIndexSeriesDriver } from '../drivers/mock-index-series.driver';
import { IndexSeriesSourcePort } from '../ports/index-series-source.port';
import { FixedIncomeServicesModule } from '../services/fixed-income-services.module';
import { FixedIncomePreviewApplication } from './fixed-income-preview.application';
import { FixedIncomeSampleApplication } from './fixed-income-sample.application';
import { FixedIncomeTitleApplication } from './fixed-income-title.application';
import { IndexSyncApplication } from './index-sync.application';

@Module({
    imports: [
        ConfigModule.forFeature(fixedIncomeConfig),
        ContextModule,
        QueueModule,
        ThrottleModule,
        AllocationApplicationModule,
        FixedIncomeDomainModule,
        FixedIncomeServicesModule
    ],
    providers: [
        BcbSgsSeriesDriver,
        MockIndexSeriesDriver,
        {
            provide: IndexSeriesSourcePort,
            inject: [fixedIncomeConfig.KEY, BcbSgsSeriesDriver, MockIndexSeriesDriver],
            useFactory: (
                config: ConfigType<typeof fixedIncomeConfig>,
                bcb: BcbSgsSeriesDriver,
                mock: MockIndexSeriesDriver
            ): IndexSeriesSourcePort => (config.FIXED_INCOME_INDEX_DRIVER === 'mock' ? mock : bcb)
        },
        FixedIncomeTitleApplication,
        FixedIncomePreviewApplication,
        FixedIncomeSampleApplication,
        IndexSyncApplication
    ],
    exports: [FixedIncomeTitleApplication, FixedIncomePreviewApplication, IndexSyncApplication, FixedIncomeServicesModule]
})
export class FixedIncomeApplicationModule {}
