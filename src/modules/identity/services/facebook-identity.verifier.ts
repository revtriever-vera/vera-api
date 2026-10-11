import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { HashUtil } from '../../../shared/utils/hash.util';
import { authConfig } from '../config/auth.config';
import { InvalidFacebookTokenError, ProviderDisabledError } from '../domain/identity.errors';
import { LOGIN_PROVIDERS, LoginProvider, SocialIdentity } from '../domain/identity.types';
import { SocialIdentityVerifierPort } from '../ports/social-identity-verifier.port';
import { FacebookGraphClient, FacebookProfile, FacebookTokenInfo } from './facebook-graph.client';

const USER_TOKEN_TYPE: string = 'USER';

@Injectable()
export class FacebookIdentityVerifier extends SocialIdentityVerifierPort {
    public readonly provider: LoginProvider = LOGIN_PROVIDERS.facebook;

    public constructor(
        private readonly graph: FacebookGraphClient,
        @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>
    ) {
        super();
    }

    public get enabled(): boolean {
        return this.config.FACEBOOK_APP_ID !== '';
    }

    public async verify(accessToken: string): Promise<SocialIdentity> {
        if (!this.enabled) {
            throw new ProviderDisabledError(this.provider);
        }
        const info: FacebookTokenInfo = await this.graph.debugToken(accessToken);
        this.assertIssuedForThisApp(info);
        const profile: FacebookProfile = await this.graph.profile(
            accessToken,
            HashUtil.hmacSha256(accessToken, this.config.FACEBOOK_APP_SECRET)
        );
        if (profile.id !== info.userId) {
            throw new InvalidFacebookTokenError();
        }
        return {
            provider: this.provider,
            subject: profile.id,
            email: profile.email?.toLowerCase() ?? null,
            emailVerified: false,
            name: profile.name
        };
    }

    private assertIssuedForThisApp(info: FacebookTokenInfo): void {
        if (!info.isValid || info.appId !== this.config.FACEBOOK_APP_ID || info.type !== USER_TOKEN_TYPE || info.userId === null) {
            throw new InvalidFacebookTokenError();
        }
    }
}
