import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { createRemoteJWKSet, JWTPayload, jwtVerify, JWTVerifyGetKey } from 'jose';
import { authConfig } from '../config/auth.config';
import { InvalidGoogleTokenError, ProviderDisabledError } from '../domain/identity.errors';
import { LOGIN_PROVIDERS, LoginProvider, SocialIdentity } from '../domain/identity.types';
import { SocialIdentityVerifierPort } from '../ports/social-identity-verifier.port';

const GOOGLE_CERTS_URL: string = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS: readonly string[] = ['https://accounts.google.com', 'accounts.google.com'];

interface GoogleClaims extends JWTPayload {
    readonly email?: string;
    readonly email_verified?: boolean;
    readonly name?: string;
}

@Injectable()
export class GoogleIdentityVerifier extends SocialIdentityVerifierPort {
    public readonly provider: LoginProvider = LOGIN_PROVIDERS.google;
    private readonly keys: JWTVerifyGetKey = createRemoteJWKSet(new URL(GOOGLE_CERTS_URL));

    public constructor(@Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>) {
        super();
    }

    public get enabled(): boolean {
        return this.config.GOOGLE_CLIENT_ID !== '';
    }

    public async verify(idToken: string): Promise<SocialIdentity> {
        return this.verifyWith(idToken, this.keys);
    }

    public async verifyWith(idToken: string, keys: JWTVerifyGetKey): Promise<SocialIdentity> {
        if (!this.enabled) {
            throw new ProviderDisabledError(this.provider);
        }
        const claims: GoogleClaims = await this.claimsOf(idToken, keys);
        if (claims.email_verified !== true || typeof claims.email !== 'string' || typeof claims.sub !== 'string') {
            throw new InvalidGoogleTokenError();
        }
        return {
            provider: this.provider,
            subject: claims.sub,
            email: claims.email.toLowerCase(),
            emailVerified: true,
            name: claims.name ?? null
        };
    }

    private async claimsOf(idToken: string, keys: JWTVerifyGetKey): Promise<GoogleClaims> {
        try {
            const verified: { payload: GoogleClaims } = await jwtVerify<GoogleClaims>(idToken, keys, {
                issuer: [...GOOGLE_ISSUERS],
                audience: this.config.GOOGLE_CLIENT_ID
            });
            return verified.payload;
        } catch {
            throw new InvalidGoogleTokenError();
        }
    }
}
