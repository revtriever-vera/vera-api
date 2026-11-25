import { Module } from '@nestjs/common';
import { InvestmentImportRepositoryModule } from '../repositories/investment-import-repository.module';
import { InvestmentImportPreviewDomain } from './investment-import-preview.domain';

@Module({
    imports: [InvestmentImportRepositoryModule],
    providers: [InvestmentImportPreviewDomain],
    exports: [InvestmentImportPreviewDomain]
})
export class InvestmentImportDomainModule {}
