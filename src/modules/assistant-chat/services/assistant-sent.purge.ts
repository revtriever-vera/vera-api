import { Injectable } from '@nestjs/common';
import { AiDataPurgePort } from '../../ai-assistant/services/ai-data-purge.port';
import { AssistantMessageDomain } from '../domain/assistant-message.domain';

export const ASSISTANT_SENT_PURGE_AREA: string = 'assistant_sent';

@Injectable()
export class AssistantSentPurge extends AiDataPurgePort {
    public readonly area: string = ASSISTANT_SENT_PURGE_AREA;

    public constructor(private readonly messages: AssistantMessageDomain) {
        super();
    }

    public async purge(): Promise<number> {
        return this.messages.eraseSent();
    }
}
