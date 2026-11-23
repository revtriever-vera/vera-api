import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { ThrottleService } from '../../../core/throttle/throttle.service';
import type { WhatsAppChannel } from '../../whatsapp/services/whatsapp-channel.service';
import { WhatsAppDisplayNumber } from '../../whatsapp/services/whatsapp-display-number.service';
import { whatsappLinkConfig } from '../config/whatsapp-link.config';
import { LinkCodeDomain } from '../domain/link-code.domain';
import { generateLinkCode } from '../domain/link-code';
import { linkTextOf } from '../domain/link-message';
import { CODE_REQUESTS_PER_USER_PER_HOUR, ONE_HOUR_SECONDS } from '../domain/whatsapp-link.types';
import { IssuedCode } from '../validation/link.schemas';

const MINUTE_MS: number = 60_000;

@Injectable()
export class LinkCodeIssuer {
    public constructor(
        private readonly codes: LinkCodeDomain,
        private readonly displayNumber: WhatsAppDisplayNumber,
        private readonly throttle: ThrottleService,
        @Inject(whatsappLinkConfig.KEY) private readonly config: ConfigType<typeof whatsappLinkConfig>
    ) {}

    public async allow(userId: string): Promise<void> {
        await this.throttle.assertAllowed(`whatsapp-link-code-user:${userId}`, CODE_REQUESTS_PER_USER_PER_HOUR, ONE_HOUR_SECONDS);
    }

    public async issue(userId: string, channel: WhatsAppChannel): Promise<IssuedCode> {
        const veraNumber: string = await this.displayNumber.digitsOf(channel);
        const code: string = generateLinkCode();
        const expiresAt: Date = new Date(Date.now() + this.config.WHATSAPP_LINK_CODE_TTL_MINUTES * MINUTE_MS);
        await this.persist(userId, code, expiresAt);
        return {
            code,
            waLink: `https://wa.me/${veraNumber}?text=${encodeURIComponent(linkTextOf(code))}`,
            expiresAt: expiresAt.toISOString()
        };
    }

    @UsingTransaction()
    private async persist(userId: string, code: string, expiresAt: Date): Promise<void> {
        await this.codes.issue(userId, code, expiresAt);
    }
}
