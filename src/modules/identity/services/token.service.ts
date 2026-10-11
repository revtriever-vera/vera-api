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
}

const JWT_ALGORITHM: Algorithm = 'HS256';
const OPAQUE_TOKEN_BYTES: number = 32;
const SECONDS_PER_MINUTE: number = 60;

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

    public signAccessToken(userId: string, companyId: string, sessionId: string, locale: AppLocale): string {
        const claims: TokenClaims = { sub: userId, companyId, purpose: TOKEN_PURPOSES.access, sessionId, locale };
        return this.jwt.sign({ ...claims }, { expiresIn: this.accessTtlSeconds });
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
            locale: raw.locale as AppLocale
        };
    }
}
