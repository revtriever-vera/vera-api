import { timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { HmacPort } from '../../../core/crypto/hmac.port';
import { publicApiUrl } from '../../../shared/utils/public-api-url';
import { bankConnectionsConfig } from '../config/bank-connections.config';
import { PLUGGY_WEBHOOK_PATH } from '../domain/bank-connections.types';

const SIGNATURE_PURPOSE: string = 'pluggy-webhook';
const SEPARATOR: string = '.';
const UUID_PATTERN: RegExp = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SIGNATURE_PATTERN: RegExp = /^[0-9a-f]{64}$/;

@Injectable()
export class PluggyWebhookUrlService {
    public constructor(
        private readonly hmac: HmacPort,
        @Inject(bankConnectionsConfig.KEY) private readonly config: ConfigType<typeof bankConnectionsConfig>
    ) {}

    public get enabled(): boolean {
        return this.config.PLUGGY_WEBHOOK_BASE_URL !== null;
    }

    public urlFor(companyId: string): string | null {
        const base: string | null = this.config.PLUGGY_WEBHOOK_BASE_URL;
        if (base === null) {
            return null;
        }
        return publicApiUrl(base, `${PLUGGY_WEBHOOK_PATH}/${this.tokenFor(companyId)}`);
    }

    public tokenFor(companyId: string): string {
        return `${companyId}${SEPARATOR}${this.signatureOf(companyId)}`;
    }

    public companyOf(token: string): string | null {
        const [companyId, signature, ...rest] = token.toLowerCase().split(SEPARATOR);
        if (companyId === undefined || signature === undefined || rest.length > 0) {
            return null;
        }
        if (!UUID_PATTERN.test(companyId) || !SIGNATURE_PATTERN.test(signature)) {
            return null;
        }
        const expected: Buffer = Buffer.from(this.signatureOf(companyId), 'hex');
        return timingSafeEqual(expected, Buffer.from(signature, 'hex')) ? companyId : null;
    }

    private signatureOf(companyId: string): string {
        return this.hmac.sha256Hex(`${SIGNATURE_PURPOSE}:${companyId}`);
    }
}
