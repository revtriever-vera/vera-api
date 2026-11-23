import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { ThrottleModule } from '../../../../core/throttle/throttle.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { FixedIncomeCoverageApplicationModule } from '../../application/fixed-income-coverage-application.module';
import { FgcController } from './fgc.controller';

@Module({
    imports: [FixedIncomeCoverageApplicationModule, IdentityApplicationModule, ThrottleModule, ContextModule],
    controllers: [FgcController]
})
export class FixedIncomeCoverageHttpModule {}
