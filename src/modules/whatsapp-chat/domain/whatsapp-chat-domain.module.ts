import { Module } from '@nestjs/common';
import { WhatsAppChatRepositoryModule } from '../repositories/whatsapp-chat-repository.module';
import { PendingActionDomain } from './pending-action.domain';

@Module({
    imports: [WhatsAppChatRepositoryModule],
    providers: [PendingActionDomain],
    exports: [PendingActionDomain]
})
export class WhatsAppChatDomainModule {}
