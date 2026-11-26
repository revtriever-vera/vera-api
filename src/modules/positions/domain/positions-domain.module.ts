import { Module } from '@nestjs/common';
import { PositionsRepositoryModule } from '../repositories/positions-repository.module';
import { InvestmentImportDomain } from './investment-import.domain';
import { InvestmentOperationDomain } from './investment-operation.domain';
import { PositionDomain } from './position.domain';

@Module({
    imports: [PositionsRepositoryModule],
    providers: [PositionDomain, InvestmentImportDomain, InvestmentOperationDomain],
    exports: [PositionDomain, InvestmentImportDomain, InvestmentOperationDomain]
})
export class PositionsDomainModule {}
