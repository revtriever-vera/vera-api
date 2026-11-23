import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { PlansApplicationModule } from '../../../plans/application/plans-application.module';
import { AiAssistantApplicationModule } from '../../application/ai-assistant-application.module';
import { AiConsentController } from './ai-consent.controller';
import { AiPayloadController } from './ai-payload.controller';

@Module({
    imports: [AiAssistantApplicationModule, PlansApplicationModule, IdentityApplicationModule, ContextModule],
    controllers: [AiConsentController, AiPayloadController]
})
export class AiAssistantHttpModule {}
