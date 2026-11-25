import { Module } from '@nestjs/common';
import { AssistantChatApplicationModule } from '../../application/assistant-chat-application.module';
import { AssistantChatRetentionCommand, AssistantChatRetentionTickHandler } from './assistant-chat-retention.command';

@Module({
    imports: [AssistantChatApplicationModule],
    providers: [AssistantChatRetentionCommand, AssistantChatRetentionTickHandler]
})
export class AssistantChatCommandModule {}
