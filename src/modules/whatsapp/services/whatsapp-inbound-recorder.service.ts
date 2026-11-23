import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { WhatsAppMessageDomain } from '../domain/whatsapp-message.domain';
import { InboundMessage } from '../domain/whatsapp.types';

@Injectable()
export class WhatsAppInboundRecorder {
    public constructor(private readonly messages: WhatsAppMessageDomain) {}

    @AsCompany()
    public async record(_companyId: string, message: InboundMessage): Promise<boolean> {
        return this.messages.recordInbound(message);
    }
}
