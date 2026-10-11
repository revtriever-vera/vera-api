import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { RateLimitGuard } from './rate-limit.guard';

export const RATE_LIMIT_KEY: string = 'rateLimit';

export interface RateLimitSubject {
    readonly body: Readonly<Record<string, unknown>>;
    readonly params: Readonly<Record<string, string>>;
    readonly ip: string;
    readonly companyId?: string;
}

export interface RateLimitOptions {
    readonly key: string;
    readonly limit: number;
    readonly windowSeconds: number;
    readonly identify: (subject: RateLimitSubject) => string | null;
}

export function RateLimit(options: RateLimitOptions): MethodDecorator {
    return applyDecorators(SetMetadata(RATE_LIMIT_KEY, options), UseGuards(RateLimitGuard));
}
