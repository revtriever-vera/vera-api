import { Module } from '@nestjs/common';
import { AssistantChatRepositoryModule } from '../repositories/assistant-chat-repository.module';
import { AssistantConversationDomain } from './assistant-conversation.domain';
import { AssistantMessageDomain } from './assistant-message.domain';
import { AssistantPendingActionDomain } from './assistant-pending-action.domain';

@Module({
    imports: [AssistantChatRepositoryModule],
    providers: [AssistantConversationDomain, AssistantMessageDomain, AssistantPendingActionDomain],
    exports: [AssistantConversationDomain, AssistantMessageDomain, AssistantPendingActionDomain]
})
export class AssistantChatDomainModule {}
