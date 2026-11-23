import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { WhatsAppMessageDomain } from '../domain/whatsapp-message.domain';
import { InboundMessage } from '../domain/whatsapp.types';

@Injectable()
export class WhatsAppInboundRecorder {
    public constructor(private readonly messages: WhatsAppMessageDomain) {}

    @AsCompany()
    public async record(_companyId: string, message: InboundMessage, linkId: string | null = null): Promise<boolean> {
        return this.messages.recordInbound(message, linkId);
    }

    @AsCompany()
    public async discard(_companyId: string, wamid: string): Promise<void> {
        await this.messages.discardInbound(wamid);
    }
}
