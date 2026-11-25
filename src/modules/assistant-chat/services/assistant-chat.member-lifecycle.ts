import { Injectable } from '@nestjs/common';
import { MemberDeparturePort } from '../../identity/services/member-departure.port';
import { AssistantConversationDomain } from '../domain/assistant-conversation.domain';

@Injectable()
export class AssistantChatMemberLifecycle extends MemberDeparturePort {
    public readonly area: string = 'assistant_chat';

    public constructor(private readonly conversations: AssistantConversationDomain) {
        super();
    }

    public async onMemberRemoved(userId: string): Promise<void> {
        await this.conversations.eraseOfUser(userId);
    }
}
