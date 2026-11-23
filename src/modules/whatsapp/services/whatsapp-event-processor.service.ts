import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { WhatsAppMessageDomain } from '../domain/whatsapp-message.domain';
import { InboundMessage, StatusUpdate, WhatsAppChannel } from '../domain/whatsapp.types';
import { InboundDispatchRegistry } from './inbound-dispatch.registry';

@Injectable()
export class WhatsAppEventProcessor {
    public constructor(
        private readonly messages: WhatsAppMessageDomain,
        private readonly registry: InboundDispatchRegistry
    ) {}

    public async processHosted(message: InboundMessage, channel: WhatsAppChannel): Promise<void> {
        await this.registry.dispatch(message, channel);
    }

    public async advance(update: StatusUpdate): Promise<boolean> {
        return this.messages.advanceStatus(update);
    }

    @AsCompany()
    public async processTenant(_companyId: string, message: InboundMessage, channel: WhatsAppChannel): Promise<boolean> {
        if (!(await this.messages.recordInbound(message))) {
            return false;
        }
        try {
            await this.registry.dispatch(message, channel);
        } catch (error: unknown) {
            await this.messages.discardInbound(message.wamid);
            throw error;
        }
        return true;
    }
}
