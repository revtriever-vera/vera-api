import { CipherGCM, createCipheriv, createDecipheriv, DecipherGCM, randomBytes } from 'node:crypto';
import { SealContext } from '../secret-sealer.port';

const IV_LENGTH: number = 12;
const TAG_LENGTH: number = 16;

export interface GcmParts {
    readonly i: string;
    readonly t: string;
    readonly c: string;
}

export function additionalDataOf(context: SealContext): Buffer {
    return Buffer.from(`${context.companyId}|${context.purpose}`, 'utf8');
}

export function encryptWithKey(key: Uint8Array, plain: string, context: SealContext): GcmParts {
    const iv: Buffer = randomBytes(IV_LENGTH);
    const cipher: CipherGCM = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_LENGTH });
    cipher.setAAD(additionalDataOf(context));
    const encrypted: Buffer = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return {
        i: iv.toString('base64url'),
        t: cipher.getAuthTag().toString('base64url'),
        c: encrypted.toString('base64url')
    };
}

export function decryptWithKey(key: Uint8Array, parts: GcmParts, context: SealContext): string {
    const decipher: DecipherGCM = createDecipheriv('aes-256-gcm', key, Buffer.from(parts.i, 'base64url'), { authTagLength: TAG_LENGTH });
    decipher.setAAD(additionalDataOf(context));
    decipher.setAuthTag(Buffer.from(parts.t, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(parts.c, 'base64url')), decipher.final()]).toString('utf8');
}
