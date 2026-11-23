import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { ThrottleModule } from '../../../../core/throttle/throttle.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { SignupLinksApplicationModule } from '../../application/signup-links-application.module';
import { BillingOfferController } from './billing-offer.controller';
import { PlatformSignupLinksController } from './platform-signup-links.controller';
import { PublicSignupLinksController } from './public-signup-links.controller';

@Module({
    imports: [SignupLinksApplicationModule, IdentityApplicationModule, ContextModule, ThrottleModule],
    controllers: [PlatformSignupLinksController, PublicSignupLinksController, BillingOfferController]
})
export class SignupLinksHttpModule {}
