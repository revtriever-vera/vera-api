import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { HmacPort } from '../../../core/crypto/hmac.port';
import { SecretSealerPort } from '../../../core/crypto/secret-sealer.port';
import { HashUtil } from '../../../shared/utils/hash.util';
import { whatsappLinkConfig } from '../config/whatsapp-link.config';

const PURPOSE: string = 'whatsapp-link-phone';
const LAST_DIGITS: number = 4;

@Injectable()
export class PhoneVault {
    public constructor(
        private readonly sealer: SecretSealerPort,
        private readonly hmac: HmacPort,
        @Inject(whatsappLinkConfig.KEY) private readonly config: ConfigType<typeof whatsappLinkConfig>
    ) {}

    public digitsOf(raw: string): string {
        return raw.replaceAll(/\D/g, '');
    }

    public hashOf(phone: string): string {
        const digits: string = this.digitsOf(phone);
        const key: string | null = this.config.WHATSAPP_PHONE_HMAC_KEY;
        return key === null ? this.hmac.sha256Hex(digits) : HashUtil.hmacSha256(digits, key);
    }

    public last4Of(phone: string): string {
        return this.digitsOf(phone).slice(-LAST_DIGITS);
    }

    public async seal(phone: string, companyId: string): Promise<string> {
        return this.sealer.seal(this.digitsOf(phone), { companyId, purpose: PURPOSE });
    }

    public async open(sealed: unknown, companyId: string): Promise<string> {
        return this.sealer.open(String(sealed), { companyId, purpose: PURPOSE });
    }
}
