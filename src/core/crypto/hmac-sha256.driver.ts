import { createHmac } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { cryptoConfig } from './config/crypto.config';
import { HmacPort } from './hmac.port';

@Injectable()
export class HmacSha256Driver extends HmacPort {
    private readonly key: Buffer;

    public constructor(@Inject(cryptoConfig.KEY) config: ConfigType<typeof cryptoConfig>) {
        super();
        this.key = Buffer.from(config.CRYPTO_KEY_HEX, 'hex');
    }

    public sha256Hex(value: string): string {
        return createHmac('sha256', this.key).update(value).digest('hex');
    }
}
