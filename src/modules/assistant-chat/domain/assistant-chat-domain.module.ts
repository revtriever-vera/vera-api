import { Module } from '@nestjs/common';
import { AssistantChatRepositoryModule } from '../repositories/assistant-chat-repository.module';
import { AssistantConversationDomain } from './assistant-conversation.domain';
import { AssistantMessageDomain } from './assistant-message.domain';

@Module({
    imports: [AssistantChatRepositoryModule],
    providers: [AssistantConversationDomain, AssistantMessageDomain],
    exports: [AssistantConversationDomain, AssistantMessageDomain]
})
export class AssistantChatDomainModule {}
