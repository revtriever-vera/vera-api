import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { ThrottleModule } from '../../../../core/throttle/throttle.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { PlansApplicationModule } from '../../../plans/application/plans-application.module';
import { WhatsAppLinkApplicationModule } from '../../application/whatsapp-link-application.module';
import { LinkController } from './link.controller';

@Module({
    imports: [WhatsAppLinkApplicationModule, PlansApplicationModule, IdentityApplicationModule, ThrottleModule, ContextModule],
    controllers: [LinkController]
})
export class WhatsAppLinkHttpModule {}
