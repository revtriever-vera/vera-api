import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';

const PREFIX: string = 'sha256=';

@Injectable()
export class SignatureVerifier {
    public sign(rawBody: string, appSecret: string): string {
        return `${PREFIX}${createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')}`;
    }

    public verify(rawBody: string, header: string | null, appSecret: string): boolean {
        if (header === null || header.length === 0) {
            return false;
        }
        return this.safeEqual(this.sign(rawBody, appSecret), header.trim().toLowerCase());
    }

    public safeEqual(left: string, right: string): boolean {
        const a: Buffer = Buffer.from(left, 'utf8');
        const b: Buffer = Buffer.from(right, 'utf8');
        return a.length === b.length && timingSafeEqual(a, b);
    }
}
