import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { ThrottleModule } from '../../../../core/throttle/throttle.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { SpendingCutsApplicationModule } from '../../application/spending-cuts-application.module';
import { CutsController } from './cuts.controller';

@Module({
    imports: [SpendingCutsApplicationModule, IdentityApplicationModule, ThrottleModule, ContextModule],
    controllers: [CutsController]
})
export class SpendingCutsHttpModule {}
