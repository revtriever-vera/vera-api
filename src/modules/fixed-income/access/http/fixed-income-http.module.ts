import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { FixedIncomeApplicationModule } from '../../application/fixed-income-application.module';
import { FixedIncomeController } from './fixed-income.controller';

@Module({
    imports: [FixedIncomeApplicationModule, IdentityApplicationModule, ContextModule],
    controllers: [FixedIncomeController]
})
export class FixedIncomeHttpModule {}
