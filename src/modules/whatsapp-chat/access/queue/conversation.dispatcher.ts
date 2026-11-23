import { Injectable } from '@nestjs/common';
import type { InboundMessage, WhatsAppChannel } from '../../../whatsapp/services/inbound-dispatch.port';
import { InboundDispatchPort } from '../../../whatsapp/services/inbound-dispatch.port';
import { ConversationApplication } from '../../application/conversation.application';

@Injectable()
export class ConversationDispatcher extends InboundDispatchPort {
    public constructor(private readonly application: ConversationApplication) {
        super();
    }

    public async handle(message: InboundMessage, channel: WhatsAppChannel): Promise<void> {
        await this.application.handle(message, channel);
    }
}
