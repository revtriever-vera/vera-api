import { ConfigType } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authConfig } from '../config/auth.config';
import { InvalidFacebookTokenError, ProviderUnavailableError } from '../domain/identity.errors';
import { FacebookGraphClient } from './facebook-graph.client';

const config: ConfigType<typeof authConfig> = {
    FACEBOOK_APP_ID: 'fake-app-id',
    FACEBOOK_APP_SECRET: 'fake-app-secret',
    FACEBOOK_GRAPH_VERSION: 'v99.0'
} as ConfigType<typeof authConfig>;

function reply(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('FacebookGraphClient', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function stubFetch(response: Response | Error): ReturnType<typeof vi.fn> {
        const fetchMock: ReturnType<typeof vi.fn> = vi.fn(async () => (response instanceof Error ? Promise.reject(response) : response));
        vi.stubGlobal('fetch', fetchMock);
        return fetchMock;
    }

    it('consulta o debug_token na versão configurada com o token do app', async () => {
        const fetchMock: ReturnType<typeof vi.fn> = stubFetch(
            reply(200, { data: { is_valid: true, app_id: 'fake-app-id', type: 'USER', user_id: 'u1' } })
        );

        const info = await new FacebookGraphClient(config).debugToken('user-token');

        expect(info).toEqual({ isValid: true, appId: 'fake-app-id', type: 'USER', userId: 'u1' });
        const url: URL = fetchMock.mock.calls[0]?.[0] as URL;
        expect(url.origin + url.pathname).toBe('https://graph.facebook.com/v99.0/debug_token');
        expect(url.searchParams.get('input_token')).toBe('user-token');
        expect(url.searchParams.get('access_token')).toBe('fake-app-id|fake-app-secret');
    });

    it('trata campos ausentes do debug_token como token inválido', async () => {
        stubFetch(reply(200, { data: {} }));

        const info = await new FacebookGraphClient(config).debugToken('user-token');

        expect(info).toEqual({ isValid: false, appId: null, type: null, userId: null });
    });

    it('consulta /me com os campos pedidos e o appsecret_proof', async () => {
        const fetchMock: ReturnType<typeof vi.fn> = stubFetch(reply(200, { id: 'u1', name: 'Ana', email: 'ana@example.test' }));

        const profile = await new FacebookGraphClient(config).profile('user-token', 'proof-1');

        expect(profile).toEqual({ id: 'u1', name: 'Ana', email: 'ana@example.test' });
        const url: URL = fetchMock.mock.calls[0]?.[0] as URL;
        expect(url.pathname).toBe('/v99.0/me');
        expect(url.searchParams.get('fields')).toBe('id,name,email');
        expect(url.searchParams.get('appsecret_proof')).toBe('proof-1');
    });

    it('perfil sem nome nem e-mail vira nulos', async () => {
        stubFetch(reply(200, { id: 'u1' }));

        expect(await new FacebookGraphClient(config).profile('t', 'p')).toEqual({ id: 'u1', name: null, email: null });
    });

    it('resposta fora do contrato é token inválido', async () => {
        stubFetch(reply(200, { unexpected: true }));

        await expect(new FacebookGraphClient(config).profile('t', 'p')).rejects.toBeInstanceOf(InvalidFacebookTokenError);
    });

    it('resposta 200 fora do contrato no debug_token é token inválido', async () => {
        stubFetch(reply(200, { unexpected: true }));

        await expect(new FacebookGraphClient(config).debugToken('t')).rejects.toBeInstanceOf(InvalidFacebookTokenError);
    });

    it('erro 4xx do Graph é token inválido', async () => {
        stubFetch(reply(400, { error: { code: 190, message: 'Invalid OAuth access token.' } }));

        await expect(new FacebookGraphClient(config).profile('t', 'p')).rejects.toBeInstanceOf(InvalidFacebookTokenError);
    });

    it('corpo ilegível em 4xx também é token inválido', async () => {
        stubFetch(new Response('not json', { status: 400 }));

        await expect(new FacebookGraphClient(config).profile('t', 'p')).rejects.toBeInstanceOf(InvalidFacebookTokenError);
    });

    it.each([
        ['5xx', reply(503, {})],
        ['limite de taxa do Graph', reply(400, { error: { code: 4 } })],
        ['falha de rede ou timeout', new Error('boom')]
    ])('%s vira provider_unavailable', async (_label: string, response: Response | Error) => {
        stubFetch(response);

        await expect(new FacebookGraphClient(config).debugToken('t')).rejects.toBeInstanceOf(ProviderUnavailableError);
    });
});
