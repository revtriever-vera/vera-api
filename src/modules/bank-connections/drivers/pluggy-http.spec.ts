import { afterEach, describe, expect, it, vi } from 'vitest';
import { PluggyAuthRejectedError, PluggyNotFoundError, PluggyUnavailableError } from '../ports/pluggy-client.errors';
import { PluggyHttp } from './pluggy-http';

function respond(status: number, body: unknown = {}, headers: Record<string, string> = {}): Response {
    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

describe('PluggyHttp', () => {
    const http: PluggyHttp = new PluggyHttp('https://pluggy.invalid', '/auth', 500);

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('expõe só postAuth e get, nenhum método de escrita', () => {
        const methods: string[] = Object.getOwnPropertyNames(PluggyHttp.prototype).filter(
            (name: string): boolean => name !== 'constructor'
        );

        expect(methods.sort()).toEqual(['get', 'postAuth']);
    });

    it('envia o JSON das credenciais em POST /auth e o X-API-KEY nas leituras', async () => {
        const fetchMock: ReturnType<typeof vi.fn> = vi.fn().mockImplementation(() => Promise.resolve(respond(200, { ok: true })));
        vi.stubGlobal('fetch', fetchMock);

        await http.postAuth({ clientId: 'id', clientSecret: 'secret' });
        await http.get('/items/abc', 'key-1');

        const [authUrl, authInit] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(authUrl).toBe('https://pluggy.invalid/auth');
        expect(authInit.method).toBe('POST');
        expect(JSON.parse(authInit.body as string)).toEqual({ clientId: 'id', clientSecret: 'secret' });
        const [itemUrl, itemInit] = fetchMock.mock.calls[1] as [string, RequestInit];
        expect(itemUrl).toBe('https://pluggy.invalid/items/abc');
        expect(itemInit.method).toBe('GET');
        expect(itemInit.headers).toMatchObject({ 'X-API-KEY': 'key-1' });
        expect(itemInit.body).toBeUndefined();
    });

    it.each([400, 401, 403])('trata %i em /auth como credencial recusada', async (status) => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(status, { message: 'corpo-que-nao-pode-vazar' })));

        await expect(http.postAuth({ clientId: 'id', clientSecret: 's' })).rejects.toBeInstanceOf(PluggyAuthRejectedError);
    });

    it('trata 401 numa leitura como chave recusada e 404 e 403 como não encontrado', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValueOnce(respond(401)).mockResolvedValueOnce(respond(404)).mockResolvedValueOnce(respond(403))
        );

        await expect(http.get('/items/x', 'k')).rejects.toBeInstanceOf(PluggyAuthRejectedError);
        await expect(http.get('/items/x', 'k')).rejects.toBeInstanceOf(PluggyNotFoundError);
        await expect(http.get('/items/x', 'k')).rejects.toBeInstanceOf(PluggyNotFoundError);
    });

    it('lê o Retry-After do 429 e usa 60 quando falta', async () => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValueOnce(respond(429, {}, { 'retry-after': '17' }))
                .mockResolvedValueOnce(respond(429))
                .mockResolvedValueOnce(respond(429, {}, { 'retry-after': 'amanhã' }))
        );

        await expect(http.get('/x', 'k')).rejects.toMatchObject({ reason: 'rate_limited', httpStatus: 429, retryAfterSeconds: 17 });
        await expect(http.get('/x', 'k')).rejects.toMatchObject({ retryAfterSeconds: 60 });
        await expect(http.get('/x', 'k')).rejects.toMatchObject({ retryAfterSeconds: 60 });
    });

    it('classifica 5xx e os demais status como indisponibilidade neutra, sem o corpo', async () => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValueOnce(respond(503, { secret: 'corpo-que-nao-pode-vazar' }, { 'retry-after': '5' }))
                .mockResolvedValueOnce(respond(500))
                .mockResolvedValueOnce(respond(418))
        );

        const server: unknown = await http.get('/x', 'k').catch((error: unknown) => error);
        expect(server).toBeInstanceOf(PluggyUnavailableError);
        expect(server).toMatchObject({ reason: 'server_error', httpStatus: 503, retryAfterSeconds: 5 });
        expect(JSON.stringify(server)).not.toContain('corpo-que-nao-pode-vazar');
        expect((server as Error).message).not.toContain('corpo-que-nao-pode-vazar');
        await expect(http.get('/x', 'k')).rejects.toMatchObject({ reason: 'server_error', retryAfterSeconds: null });
        await expect(http.get('/x', 'k')).rejects.toMatchObject({ reason: 'unexpected_status', httpStatus: 418 });
    });

    it('distingue timeout de rede fora do ar e não repete a URL no erro', async () => {
        const timeout: Error = Object.assign(new Error('aborted'), { name: 'TimeoutError' });
        vi.stubGlobal(
            'fetch',
            vi.fn().mockRejectedValueOnce(timeout).mockRejectedValueOnce(new Error('connect ECONNREFUSED https://pluggy.invalid/x?token=1'))
        );

        await expect(http.get('/x', 'k')).rejects.toMatchObject({ reason: 'timeout', httpStatus: null });
        const unreachable: unknown = await http.get('/x?token=1', 'k').catch((error: unknown) => error);
        expect(unreachable).toMatchObject({ reason: 'unreachable', httpStatus: null });
        expect((unreachable as Error).message).not.toContain('token');
    });

    it('trata resposta que não é JSON como formato inválido', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { status: 200 })));

        await expect(http.get('/x', 'k')).rejects.toMatchObject({ reason: 'format_invalid', httpStatus: 200 });
    });

    it('aplica o timeout configurado ao fetch', async () => {
        const fetchMock: ReturnType<typeof vi.fn> = vi.fn().mockImplementation(() => Promise.resolve(respond(200)));
        vi.stubGlobal('fetch', fetchMock);

        await http.get('/x', 'k');

        const init: RequestInit = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
        expect(init.signal).toBeInstanceOf(AbortSignal);
    });
});
