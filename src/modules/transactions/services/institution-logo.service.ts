import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { Injectable } from '@nestjs/common';
import { HmacPort } from '../../../core/crypto/hmac.port';
import { InstitutionLogoNotFoundError } from '../domain/transactions.errors';

export interface InstitutionLogoImage {
    readonly content: Buffer;
    readonly contentType: string;
}

interface CacheEntry {
    readonly image: InstitutionLogoImage | null;
    readonly expiresAt: number;
}

export const INSTITUTION_LOGO_PATH_PREFIX: string = '/spending/institution-logos/';

const SEPARATOR: string = '.';
const FETCH_TIMEOUT_MS: number = 5000;
const MAX_URL_LENGTH: number = 500;
const MAX_BYTES: number = 512 * 1024;
const MAX_ENTRIES: number = 256;
const HIT_TTL_MS: number = 24 * 60 * 60 * 1000;
const MISS_TTL_MS: number = 10 * 60 * 1000;
const IMAGE_TYPES: ReadonlySet<string> = new Set<string>(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

@Injectable()
export class InstitutionLogoService {
    private readonly cache: Map<string, CacheEntry> = new Map<string, CacheEntry>();

    public constructor(private readonly hmac: HmacPort) {}

    public pathFor(logoUrl: string | null): string | null {
        if (logoUrl === null || !isHttpsUrl(logoUrl)) {
            return null;
        }
        const url: string = logoUrl;
        const body: string = Buffer.from(url).toString('base64url');
        return `${INSTITUTION_LOGO_PATH_PREFIX}${body}${SEPARATOR}${this.hmac.sha256Hex(body)}`;
    }

    public async load(token: string): Promise<InstitutionLogoImage> {
        const url: string | null = this.verify(token);
        if (url === null) {
            throw new InstitutionLogoNotFoundError();
        }
        const cached: CacheEntry | undefined = this.cache.get(url);
        if (cached !== undefined && cached.expiresAt > Date.now()) {
            return cached.image ?? this.fail();
        }
        const image: InstitutionLogoImage | null = await this.download(url);
        this.remember(url, image);
        return image ?? this.fail();
    }

    private fail(): never {
        throw new InstitutionLogoNotFoundError();
    }

    private verify(token: string): string | null {
        const [body, signature, ...rest]: string[] = token.split(SEPARATOR);
        if (body === undefined || signature === undefined || rest.length > 0) {
            return null;
        }
        const expected: Buffer = Buffer.from(this.hmac.sha256Hex(body));
        const received: Buffer = Buffer.from(signature);
        if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
            return null;
        }
        const url: string = Buffer.from(body, 'base64url').toString();
        return isHttpsUrl(url) && isPublicHost(new URL(url).hostname) ? url : null;
    }

    private async download(url: string): Promise<InstitutionLogoImage | null> {
        try {
            const response: Response = await fetch(url, {
                redirect: 'error',
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
                headers: { accept: 'image/png,image/jpeg,image/webp,image/gif' }
            });
            const contentType: string = mediaTypeOf(response);
            if (!response.ok || !IMAGE_TYPES.has(contentType) || declaredLengthOf(response) > MAX_BYTES) {
                return null;
            }
            const content: Buffer = Buffer.from(await response.arrayBuffer());
            return content.length === 0 || content.length > MAX_BYTES ? null : { content, contentType };
        } catch {
            return null;
        }
    }

    private remember(url: string, image: InstitutionLogoImage | null): void {
        if (this.cache.size >= MAX_ENTRIES) {
            const oldest: string | undefined = this.cache.keys().next().value;
            if (oldest !== undefined) {
                this.cache.delete(oldest);
            }
        }
        this.cache.set(url, { image, expiresAt: Date.now() + (image === null ? MISS_TTL_MS : HIT_TTL_MS) });
    }
}

function mediaTypeOf(response: Response): string {
    return (response.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

function declaredLengthOf(response: Response): number {
    return Number(response.headers.get('content-length') ?? 0);
}

function isHttpsUrl(value: string): boolean {
    try {
        const parsed: URL = new URL(value);
        return parsed.protocol === 'https:' && parsed.username === '' && parsed.password === '' && value.length <= MAX_URL_LENGTH;
    } catch {
        return false;
    }
}

function isPublicHost(hostname: string): boolean {
    const bare: string = hostname.replace(/^\[|\]$/g, '');
    return isIP(bare) === 0 && bare !== 'localhost' && !bare.endsWith('.localhost') && !bare.endsWith('.internal');
}
