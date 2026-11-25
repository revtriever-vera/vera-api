import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { ThrottleModule } from '../../../../core/throttle/throttle.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { InvestmentImportApplicationModule } from '../../application/investment-import-application.module';
import { InvestmentImportsController } from './investment-imports.controller';

@Module({
    imports: [InvestmentImportApplicationModule, IdentityApplicationModule, ThrottleModule, ContextModule],
    controllers: [InvestmentImportsController]
})
export class InvestmentImportHttpModule {}
