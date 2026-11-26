import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestBytes } from './provider-http';

const URL_OF_DOC: string = 'https://provider.example/doc';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('requestBytes', () => {
    it('returns the body as bytes', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn((): Promise<Response> => Promise.resolve(new Response(new Uint8Array([1, 2, 3]))))
        );

        await expect(requestBytes(URL_OF_DOC, {}, 1000, 10)).resolves.toEqual(new Uint8Array([1, 2, 3]));
    });

    it('rejects a body above the limit', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn((): Promise<Response> => Promise.resolve(new Response(new Uint8Array(11))))
        );

        await expect(requestBytes(URL_OF_DOC, {}, 1000, 10)).rejects.toMatchObject({ name: 'ProviderError' });
    });

    it('turns a refused status and a network failure into provider errors', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn((): Promise<Response> => Promise.resolve(new Response('', { status: 503 })))
        );
        await expect(requestBytes(URL_OF_DOC, {}, 1000, 10)).rejects.toMatchObject({
            name: 'ProviderError',
            reason: 'market-data.provider_unavailable'
        });

        vi.stubGlobal(
            'fetch',
            vi.fn((): Promise<Response> => Promise.reject(new Error('reset')))
        );
        await expect(requestBytes(URL_OF_DOC, {}, 1000, 10)).rejects.toMatchObject({ reason: 'market-data.provider_unreachable' });
    });
});
