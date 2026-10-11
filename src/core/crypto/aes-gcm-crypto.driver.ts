import { CipherGCM, createCipheriv, createDecipheriv, DecipherGCM, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { cryptoConfig } from './config/crypto.config';
import { CryptoPort } from './crypto.port';

const IV_LENGTH: number = 12;

@Injectable()
export class AesGcmCryptoDriver extends CryptoPort {
    private readonly key: Buffer;

    public constructor(@Inject(cryptoConfig.KEY) config: ConfigType<typeof cryptoConfig>) {
        super();
        this.key = Buffer.from(config.CRYPTO_KEY_HEX, 'hex');
    }

    public encrypt(plain: string): string {
        const iv: Buffer = randomBytes(IV_LENGTH);
        const cipher: CipherGCM = createCipheriv('aes-256-gcm', this.key, iv);
        const encrypted: Buffer = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
        return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
    }

    public decrypt(payload: string): string {
        const raw: Buffer = Buffer.from(payload, 'base64');
        const iv: Buffer = raw.subarray(0, IV_LENGTH);
        const tag: Buffer = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
        const encrypted: Buffer = raw.subarray(IV_LENGTH + 16);
        const decipher: DecipherGCM = createDecipheriv('aes-256-gcm', this.key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    }
}
