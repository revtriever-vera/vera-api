import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { ThrottleModule } from '../../../../core/throttle/throttle.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { AssistantChatApplicationModule } from '../../application/assistant-chat-application.module';
import { AssistantChatController } from './assistant-chat.controller';

@Module({
    imports: [AssistantChatApplicationModule, IdentityApplicationModule, ContextModule, ThrottleModule],
    controllers: [AssistantChatController]
})
export class AssistantChatHttpModule {}
