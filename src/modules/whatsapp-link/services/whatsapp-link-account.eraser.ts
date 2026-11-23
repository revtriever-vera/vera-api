import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { AccountDataEraserPort } from '../../identity/services/account-data-eraser.port';
import { LinkCodeDomain } from '../domain/link-code.domain';
import { LinkDomain } from '../domain/link.domain';
import { ERASE_BATCH } from '../domain/whatsapp-link.types';

export const WHATSAPP_LINKS_ERASE_AREA: string = 'whatsapp_links';

@Injectable()
export class WhatsAppLinkAccountEraser extends AccountDataEraserPort {
    public readonly area: string = WHATSAPP_LINKS_ERASE_AREA;

    public constructor(
        private readonly links: LinkDomain,
        private readonly codes: LinkCodeDomain
    ) {
        super();
    }

    @AsCompany()
    public async eraseAll(_companyId: string): Promise<number> {
        return (await this.codes.eraseAll(ERASE_BATCH)) + (await this.links.eraseAll(ERASE_BATCH));
    }
}
