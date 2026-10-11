import { describe, expect, it } from 'vitest';
import { FacebookIdentityVerifier } from './facebook-identity.verifier';
import { GoogleIdentityVerifier } from './google-identity.verifier';
import { SocialIdentityRegistry } from './social-identity.registry';

describe('SocialIdentityRegistry', () => {
    const google: GoogleIdentityVerifier = { provider: 'google' } as GoogleIdentityVerifier;
    const facebook: FacebookIdentityVerifier = { provider: 'facebook' } as FacebookIdentityVerifier;

    it('resolve o verificador pelo provedor', () => {
        const registry: SocialIdentityRegistry = new SocialIdentityRegistry(google, facebook);

        expect(registry.for('google')).toBe(google);
        expect(registry.for('facebook')).toBe(facebook);
    });

    it('falha alto para provedor sem verificador', () => {
        const registry: SocialIdentityRegistry = new SocialIdentityRegistry(google, facebook);

        expect(() => registry.for('github' as 'google')).toThrow('No social identity verifier');
    });
});
