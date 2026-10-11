import { Injectable } from '@nestjs/common';
import { LoginProvider } from '../domain/identity.types';
import { SocialIdentityVerifierPort } from '../ports/social-identity-verifier.port';
import { FacebookIdentityVerifier } from './facebook-identity.verifier';
import { GoogleIdentityVerifier } from './google-identity.verifier';

@Injectable()
export class SocialIdentityRegistry {
    private readonly verifiers: ReadonlyMap<LoginProvider, SocialIdentityVerifierPort>;

    public constructor(google: GoogleIdentityVerifier, facebook: FacebookIdentityVerifier) {
        this.verifiers = new Map<LoginProvider, SocialIdentityVerifierPort>(
            [google, facebook].map((verifier: SocialIdentityVerifierPort): [LoginProvider, SocialIdentityVerifierPort] => [
                verifier.provider,
                verifier
            ])
        );
    }

    public for(provider: LoginProvider): SocialIdentityVerifierPort {
        const verifier: SocialIdentityVerifierPort | undefined = this.verifiers.get(provider);
        if (!verifier) {
            throw new Error(`No social identity verifier registered for provider ${provider}`);
        }
        return verifier;
    }
}
