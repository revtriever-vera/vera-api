import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Algorithm } from 'jsonwebtoken';
import { APP_LOCALES, AppLocale } from '../../../shared/i18n/locale';
import { HashUtil } from '../../../shared/utils/hash.util';
import { authConfig } from '../config/auth.config';
import { TOKEN_PURPOSES, TokenPurpose } from '../domain/identity.types';

export interface TokenClaims {
    readonly sub: string;
    readonly companyId: string;
    readonly purpose: TokenPurpose;
    readonly sessionId: string;
    readonly locale: AppLocale;
    readonly platform: boolean;
}

export interface OpaqueToken {
    readonly raw: string;
    readonly hash: string;
}

interface RawClaims {
    readonly sub?: unknown;
    readonly companyId?: unknown;
    readonly purpose?: unknown;
    readonly sessionId?: unknown;
    readonly locale?: unknown;
    readonly platform?: unknown;
}

const JWT_ALGORITHM: Algorithm = 'HS256';
const OPAQUE_TOKEN_BYTES: number = 32;
const SECONDS_PER_MINUTE: number = 60;
const CHALLENGE_TTL_SECONDS: number = 5 * SECONDS_PER_MINUTE;
const ENROLLMENT_TTL_SECONDS: number = 15 * SECONDS_PER_MINUTE;

export type SecondFactorPurpose = typeof TOKEN_PURPOSES.totpChallenge | typeof TOKEN_PURPOSES.totpEnrollment;

export interface SecondFactorClaims {
    readonly sub: string;
    readonly companyId: string;
}

interface RawSecondFactorClaims {
    readonly sub?: unknown;
    readonly companyId?: unknown;
    readonly purpose?: unknown;
}

@Injectable()
export class TokenService {
    private readonly jwt: JwtService;
    private readonly accessTtlSeconds: number;

    public constructor(@Inject(authConfig.KEY) config: ConfigType<typeof authConfig>) {
        this.jwt = new JwtService({
            secret: config.JWT_SECRET,
            signOptions: { algorithm: JWT_ALGORITHM },
            verifyOptions: { algorithms: [JWT_ALGORITHM] }
        });
        this.accessTtlSeconds = config.ACCESS_TOKEN_TTL_MINUTES * SECONDS_PER_MINUTE;
    }

    public signAccessToken(userId: string, companyId: string, sessionId: string, locale: AppLocale, platform: boolean): string {
        const claims: TokenClaims = { sub: userId, companyId, purpose: TOKEN_PURPOSES.access, sessionId, locale, platform };
        return this.jwt.sign({ ...claims }, { expiresIn: this.accessTtlSeconds });
    }

    public signSecondFactorToken(purpose: SecondFactorPurpose, userId: string, companyId: string): string {
        const ttl: number = purpose === TOKEN_PURPOSES.totpChallenge ? CHALLENGE_TTL_SECONDS : ENROLLMENT_TTL_SECONDS;
        return this.jwt.sign({ sub: userId, companyId, purpose }, { expiresIn: ttl });
    }

    public verifySecondFactorToken(token: string, purpose: SecondFactorPurpose): SecondFactorClaims | null {
        try {
            const raw: RawSecondFactorClaims = this.jwt.verify<RawSecondFactorClaims>(token);
            const valid: boolean = raw.purpose === purpose && typeof raw.sub === 'string' && typeof raw.companyId === 'string';
            return valid ? { sub: raw.sub as string, companyId: raw.companyId as string } : null;
        } catch {
            return null;
        }
    }

    public verifyAccessToken(token: string): TokenClaims | null {
        try {
            const raw: RawClaims = this.jwt.verify<RawClaims>(token);
            return this.parseClaims(raw);
        } catch {
            return null;
        }
    }

    public generateOpaqueToken(): OpaqueToken {
        const raw: string = randomBytes(OPAQUE_TOKEN_BYTES).toString('base64url');
        return { raw, hash: HashUtil.sha256(raw) };
    }

    public hashToken(raw: string): string {
        return HashUtil.sha256(raw);
    }

    private parseClaims(raw: RawClaims): TokenClaims | null {
        if (raw.purpose !== TOKEN_PURPOSES.access) {
            return null;
        }
        if (typeof raw.sub !== 'string' || typeof raw.companyId !== 'string' || typeof raw.sessionId !== 'string') {
            return null;
        }
        if (typeof raw.locale !== 'string' || !(APP_LOCALES as readonly string[]).includes(raw.locale)) {
            return null;
        }
        return {
            sub: raw.sub,
            companyId: raw.companyId,
            purpose: TOKEN_PURPOSES.access,
            sessionId: raw.sessionId,
            locale: raw.locale as AppLocale,
            platform: raw.platform === true
        };
    }
}
