import { Injectable } from '@nestjs/common';
import type { InboundMessage, WhatsAppChannel } from '../../../whatsapp/services/inbound-dispatch.port';
import { InboundDispatchPort } from '../../../whatsapp/services/inbound-dispatch.port';
import { LinkInboundApplication } from '../../application/link-inbound.application';

@Injectable()
export class LinkInboundDispatcher extends InboundDispatchPort {
    public constructor(private readonly application: LinkInboundApplication) {
        super();
    }

    public async handle(message: InboundMessage, channel: WhatsAppChannel): Promise<void> {
        await this.application.handle(message, channel);
    }
}
