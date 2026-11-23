import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { billingConfig } from '../config/billing.config';

export const SIGNATURE_TOLERANCE_SECONDS: number = 300;
const MS_PER_SECOND: number = 1000;

export type VerificationRefusal = 'not_configured' | 'bad_token' | 'bad_signature' | 'stale';

interface ParsedSignature {
    readonly timestamp: number;
    readonly digests: readonly string[];
}

function digestOf(value: string): Buffer {
    return createHash('sha256').update(value).digest();
}

function sameText(left: string, right: string): boolean {
    return timingSafeEqual(digestOf(left), digestOf(right));
}

function parseSignature(header: string | null): ParsedSignature | null {
    if (header === null) {
        return null;
    }
    const parts: string[] = header.split(',').map((part: string): string => part.trim());
    const timestamp: number = Number(parts.find((part: string): boolean => part.startsWith('t='))?.slice(2));
    const digests: string[] = parts.filter((part: string): boolean => part.startsWith('v1=')).map((part: string): string => part.slice(3));
    return Number.isInteger(timestamp) && digests.length > 0 ? { timestamp, digests } : null;
}

@Injectable()
export class RevtrieverWebhookVerifier {
    public constructor(@Inject(billingConfig.KEY) private readonly config: ConfigType<typeof billingConfig>) {}

    public refusalOfEvent(token: string, rawBody: string, header: string | null, now: Date): VerificationRefusal | null {
        const expected: string | null = this.config.REVTRIEVER_WEBHOOK_TOKEN;
        if (expected === null || this.config.REVTRIEVER_WEBHOOK_SECRETS.length === 0) {
            return 'not_configured';
        }
        if (!sameText(token, expected)) {
            return 'bad_token';
        }
        return this.refusalOfSignature(rawBody, header, now);
    }

    public refusalOfSignature(rawBody: string, header: string | null, now: Date): VerificationRefusal | null {
        if (this.config.REVTRIEVER_WEBHOOK_SECRETS.length === 0) {
            return 'not_configured';
        }
        const parsed: ParsedSignature | null = parseSignature(header);
        if (parsed === null) {
            return 'bad_signature';
        }
        if (Math.abs(now.getTime() / MS_PER_SECOND - parsed.timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
            return 'stale';
        }
        return this.matchesAnySecret(parsed, rawBody) ? null : 'bad_signature';
    }

    private matchesAnySecret(parsed: ParsedSignature, rawBody: string): boolean {
        const signed: string = `${String(parsed.timestamp)}.${rawBody}`;
        const results: boolean[] = this.config.REVTRIEVER_WEBHOOK_SECRETS.map((secret: string): boolean => {
            const expected: string = createHmac('sha256', secret).update(signed).digest('hex');
            return parsed.digests.some((digest: string): boolean => sameText(digest, expected));
        });
        return results.includes(true);
    }
}
