import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { ThrottleModule } from '../../../../core/throttle/throttle.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { PlansApplicationModule } from '../../../plans/application/plans-application.module';
import { AiAssistantApplicationModule } from '../../application/ai-assistant-application.module';
import { AiConsentController } from './ai-consent.controller';
import { AiPayloadController } from './ai-payload.controller';
import { SummariesController } from './summaries.controller';

@Module({
    imports: [AiAssistantApplicationModule, PlansApplicationModule, IdentityApplicationModule, ContextModule, ThrottleModule],
    controllers: [AiConsentController, AiPayloadController, SummariesController]
})
export class AiAssistantHttpModule {}
