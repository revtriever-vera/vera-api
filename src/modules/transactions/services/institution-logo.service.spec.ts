import { afterEach, describe, expect, it, vi } from 'vitest';
import { InstitutionLogoService, INSTITUTION_LOGO_PATH_PREFIX } from './institution-logo.service';

const LOGO_URL: string = 'https://cdn.example/connectors/nubank.png';

function build(): InstitutionLogoService {
    return new InstitutionLogoService({ sha256Hex: (value: string): string => `sig${String(value.length)}` });
}

function tokenOf(path: string | null): string {
    return (path ?? '').slice(INSTITUTION_LOGO_PATH_PREFIX.length);
}

function imageResponse(type: string = 'image/png', bytes: number = 4): Response {
    return new Response(new Uint8Array(bytes).fill(1), { status: 200, headers: { 'content-type': type } });
}

describe('InstitutionLogoService', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('devolve um caminho assinado da própria API e nunca a URL de terceiros', () => {
        const path: string | null = build().pathFor(LOGO_URL);

        expect(path).toMatch(/^\/spending\/institution-logos\/[\w-]+\.sig\d+$/);
        expect(path).not.toContain('cdn.example');
    });

    it('não monta caminho para logo ausente, sem https ou com credenciais', () => {
        const service: InstitutionLogoService = build();

        expect(service.pathFor(null)).toBeNull();
        expect(service.pathFor('http://cdn.example/a.png')).toBeNull();
        expect(service.pathFor('https://user:pass@cdn.example/a.png')).toBeNull();
        expect(service.pathFor('not a url')).toBeNull();
    });

    it('busca a imagem uma vez e serve as próximas do cache', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(imageResponse()));
        const service: InstitutionLogoService = build();
        const token: string = tokenOf(service.pathFor(LOGO_URL));

        const first = await service.load(token);
        const second = await service.load(token);

        expect(first.contentType).toBe('image/png');
        expect(second.content).toHaveLength(4);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error' });
    });

    it('recusa token com assinatura errada sem chamar a rede', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch');
        const service: InstitutionLogoService = build();
        const forged: string = `${Buffer.from('https://evil.example/x.png').toString('base64url')}.sig0`;

        await expect(service.load(forged)).rejects.toMatchObject({ code: 'transactions.logo_not_found' });
        await expect(service.load('sem-ponto')).rejects.toMatchObject({ code: 'transactions.logo_not_found' });
        await expect(service.load('a.b.c')).rejects.toMatchObject({ code: 'transactions.logo_not_found' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('recusa host que é IP ou localhost mesmo com assinatura válida', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch');
        const service: InstitutionLogoService = build();

        await expect(service.load(tokenOf(service.pathFor('https://127.0.0.1/a.png')))).rejects.toMatchObject({
            code: 'transactions.logo_not_found'
        });
        await expect(service.load(tokenOf(service.pathFor('https://localhost/a.png')))).rejects.toMatchObject({
            code: 'transactions.logo_not_found'
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('recusa resposta que não é imagem rasterizada, é grande demais ou falhou, e lembra a falha', async () => {
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockImplementationOnce(() => Promise.resolve(imageResponse('image/svg+xml')))
            .mockImplementationOnce(() => Promise.resolve(imageResponse('image/png', 600 * 1024)))
            .mockImplementationOnce(() => Promise.reject(new Error('timeout')));
        const service: InstitutionLogoService = build();

        for (const url of ['https://a.example/1.svg', 'https://a.example/2.png', 'https://a.example/3.png']) {
            const token: string = tokenOf(service.pathFor(url));
            await expect(service.load(token)).rejects.toMatchObject({ code: 'transactions.logo_not_found' });
            await expect(service.load(token)).rejects.toMatchObject({ code: 'transactions.logo_not_found' });
        }
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });
});
