import { createHash, createHmac } from 'node:crypto';

export class HashUtil {
    public static sha256(value: string): string {
        return createHash('sha256').update(value).digest('hex');
    }

    public static hmacSha256(value: string, key: string): string {
        return createHmac('sha256', key).update(value).digest('hex');
    }
}
