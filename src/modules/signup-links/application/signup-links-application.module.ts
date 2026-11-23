import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ContextModule } from '../../../core/context/context.module';
import { CryptoModule } from '../../../core/crypto/crypto.module';
import { ThrottleModule } from '../../../core/throttle/throttle.module';
import { IdentityApplicationModule } from '../../identity/application/identity-application.module';
import { signupLinksConfig } from '../config/signup-links.config';
import { SignupLinksDomainModule } from '../domain/signup-links-domain.module';
import { PlansApplicationModule } from '../../plans/application/plans-application.module';
import { BillingOfferAdapter } from '../services/billing-offer.adapter';
import { LoginOfferAdapter } from '../services/login-offer.adapter';
import { OfferRedemptionService } from '../services/offer-redemption.service';
import { SignupLinkViewMapper } from '../services/signup-link-view.mapper';
import { SignupOfferExporter } from '../services/signup-offer.exporter';
import { TrialEmailMarkService } from '../services/trial-email-mark.service';
import { OfferRedeemApplication } from './offer-redeem.application';
import { SignupLinksAdminApplication } from './signup-links-admin.application';
import { SignupLinksPublicApplication } from './signup-links-public.application';

@Module({
    imports: [
        ConfigModule.forFeature(signupLinksConfig),
        SignupLinksDomainModule,
        IdentityApplicationModule,
        PlansApplicationModule,
        ContextModule,
        CryptoModule,
        ThrottleModule
    ],
    providers: [
        SignupLinksAdminApplication,
        SignupLinksPublicApplication,
        OfferRedeemApplication,
        SignupLinkViewMapper,
        OfferRedemptionService,
        TrialEmailMarkService,
        LoginOfferAdapter,
        BillingOfferAdapter,
        SignupOfferExporter
    ],
    exports: [SignupLinksAdminApplication, SignupLinksPublicApplication, OfferRedeemApplication]
})
export class SignupLinksApplicationModule {}
