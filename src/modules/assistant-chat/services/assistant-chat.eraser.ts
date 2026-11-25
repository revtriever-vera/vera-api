import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { AccountDataEraserPort } from '../../identity/services/account-data-eraser.port';
import { AssistantConversationDomain } from '../domain/assistant-conversation.domain';

export const ASSISTANT_CHAT_ERASE_AREA: string = 'assistant_chat';

@Injectable()
export class AssistantChatEraser extends AccountDataEraserPort {
    public readonly area: string = ASSISTANT_CHAT_ERASE_AREA;

    public constructor(private readonly conversations: AssistantConversationDomain) {
        super();
    }

    @AsCompany()
    public async eraseAll(_companyId: string): Promise<number> {
        return this.conversations.eraseAll();
    }
}
