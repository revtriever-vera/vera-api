import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { AccountDataEraserPort } from '../../identity/services/account-data-eraser.port';
import { WhatsAppMessageDomain } from '../domain/whatsapp-message.domain';

export const WHATSAPP_ERASE_AREA: string = 'whatsapp_messages';

const ERASE_BATCH: number = 500;

@Injectable()
export class WhatsAppAccountEraser extends AccountDataEraserPort {
    public readonly area: string = WHATSAPP_ERASE_AREA;

    public constructor(private readonly messages: WhatsAppMessageDomain) {
        super();
    }

    @AsCompany()
    public async eraseAll(_companyId: string): Promise<number> {
        return this.messages.eraseAll(ERASE_BATCH);
    }
}
