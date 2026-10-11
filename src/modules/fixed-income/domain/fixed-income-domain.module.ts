import { Module } from '@nestjs/common';
import { FixedIncomeRepositoryModule } from '../repositories/fixed-income-repository.module';
import { FixedIncomeTitleDomain } from './fixed-income-title.domain';
import { IndexSeriesDomain } from './index-series.domain';

@Module({
    imports: [FixedIncomeRepositoryModule],
    providers: [FixedIncomeTitleDomain, IndexSeriesDomain],
    exports: [FixedIncomeTitleDomain, IndexSeriesDomain]
})
export class FixedIncomeDomainModule {}
