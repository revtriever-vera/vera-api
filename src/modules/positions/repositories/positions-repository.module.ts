import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { InvestmentImportsRepository } from './investment-imports.repository';
import { InvestmentOperationsRepository } from './investment-operations.repository';
import { PositionsRepository } from './positions.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [PositionsRepository, InvestmentImportsRepository, InvestmentOperationsRepository],
    exports: [PositionsRepository, InvestmentImportsRepository, InvestmentOperationsRepository]
})
export class PositionsRepositoryModule {}
