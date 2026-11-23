import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { WhatsAppMessageDomain } from '../domain/whatsapp-message.domain';

@Injectable()
export class WhatsAppConversationEraser {
    public constructor(private readonly messages: WhatsAppMessageDomain) {}

    @AsCompany()
    public async eraseText(_companyId: string, linkId: string, peer: string): Promise<number> {
        return this.messages.clearTextOf(linkId, peer);
    }
}
