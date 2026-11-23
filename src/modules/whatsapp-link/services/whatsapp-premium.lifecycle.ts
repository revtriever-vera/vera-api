import { Injectable } from '@nestjs/common';
import { PremiumLifecyclePort } from '../../plans/services/premium-lifecycle.port';
import { UNLINK_REASONS } from '../domain/whatsapp-link.types';
import { LinkUnlinkService } from './link-unlink.service';

@Injectable()
export class WhatsAppPremiumLifecycle extends PremiumLifecyclePort {
    public readonly name: string = 'whatsapp-links';

    public constructor(private readonly unlinker: LinkUnlinkService) {
        super();
    }

    public async onPremiumEnded(): Promise<void> {
        await this.unlinker.unlinkCompany(UNLINK_REASONS.premiumEnded);
    }
}
