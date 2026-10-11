import { ConfigType } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { HashUtil } from '../../../shared/utils/hash.util';
import { authConfig } from '../config/auth.config';
import { InvalidFacebookTokenError, ProviderDisabledError, ProviderUnavailableError } from '../domain/identity.errors';
import { SocialIdentity } from '../domain/identity.types';
import { FacebookGraphClient, FacebookProfile, FacebookTokenInfo } from './facebook-graph.client';
import { FacebookIdentityVerifier } from './facebook-identity.verifier';

const APP_ID: string = 'fake-app-id';
const APP_SECRET: string = 'fake-app-secret';
const TOKEN: string = 'fake-user-access-token-0123456789';

const VALID_INFO: FacebookTokenInfo = { isValid: true, appId: APP_ID, type: 'USER', userId: 'fb-user-1' };
const VALID_PROFILE: FacebookProfile = { id: 'fb-user-1', name: 'Ana', email: 'Ana@Example.test' };

function build(
    info: FacebookTokenInfo | Error = VALID_INFO,
    profile: FacebookProfile | Error = VALID_PROFILE,
    appId: string = APP_ID
): { verifier: FacebookIdentityVerifier; profileCall: ReturnType<typeof vi.fn> } {
    const debugToken: ReturnType<typeof vi.fn> = vi.fn(async () => (info instanceof Error ? Promise.reject(info) : info));
    const profileCall: ReturnType<typeof vi.fn> = vi.fn(async () => (profile instanceof Error ? Promise.reject(profile) : profile));
    const config: ConfigType<typeof authConfig> = { FACEBOOK_APP_ID: appId, FACEBOOK_APP_SECRET: APP_SECRET } as ConfigType<
        typeof authConfig
    >;
    const graph: FacebookGraphClient = { debugToken, profile: profileCall } as unknown as FacebookGraphClient;
    return { verifier: new FacebookIdentityVerifier(graph, config), profileCall };
}

describe('FacebookIdentityVerifier', () => {
    it('devolve a identidade com e-mail minúsculo e emailVerified sempre falso', async () => {
        const { verifier } = build();

        const identity: SocialIdentity = await verifier.verify(TOKEN);

        expect(identity).toEqual({
            provider: 'facebook',
            subject: 'fb-user-1',
            email: 'ana@example.test',
            emailVerified: false,
            name: 'Ana'
        });
    });

    it('calcula o appsecret_proof como HMAC-SHA256 do token com o segredo do app', async () => {
        const { verifier, profileCall } = build();

        await verifier.verify(TOKEN);

        expect(profileCall).toHaveBeenCalledWith(TOKEN, HashUtil.hmacSha256(TOKEN, APP_SECRET));
    });

    it('sem e-mail devolve email nulo, para o provisionamento decidir', async () => {
        const { verifier } = build(VALID_INFO, { id: 'fb-user-1', name: null, email: null });

        const identity: SocialIdentity = await verifier.verify(TOKEN);

        expect(identity.email).toBeNull();
        expect(identity.name).toBeNull();
    });

    it.each([
        ['token inválido', { ...VALID_INFO, isValid: false }],
        ['token de outro app', { ...VALID_INFO, appId: 'outro-app' }],
        ['token que não é de usuário', { ...VALID_INFO, type: 'APP' }],
        ['token sem user_id', { ...VALID_INFO, userId: null }]
    ])('recusa %s', async (_label: string, info: FacebookTokenInfo) => {
        const { verifier, profileCall } = build(info);

        await expect(verifier.verify(TOKEN)).rejects.toBeInstanceOf(InvalidFacebookTokenError);
        expect(profileCall).not.toHaveBeenCalled();
    });

    it('recusa quando o id de /me difere do user_id do debug_token', async () => {
        const { verifier } = build(VALID_INFO, { ...VALID_PROFILE, id: 'fb-user-2' });

        await expect(verifier.verify(TOKEN)).rejects.toBeInstanceOf(InvalidFacebookTokenError);
    });

    it('propaga a indisponibilidade da Graph API', async () => {
        const { verifier } = build(new ProviderUnavailableError('facebook'));

        await expect(verifier.verify(TOKEN)).rejects.toBeInstanceOf(ProviderUnavailableError);
    });

    it('fica desligado sem app id', async () => {
        const { verifier } = build(VALID_INFO, VALID_PROFILE, '');

        expect(verifier.enabled).toBe(false);
        await expect(verifier.verify(TOKEN)).rejects.toBeInstanceOf(ProviderDisabledError);
    });
});
