import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { PlansApplicationModule } from '../../application/plans-application.module';
import { BillingMeController } from './billing-me.controller';

@Module({
    imports: [PlansApplicationModule, IdentityApplicationModule, ContextModule],
    controllers: [BillingMeController]
})
export class PlansHttpModule {}
