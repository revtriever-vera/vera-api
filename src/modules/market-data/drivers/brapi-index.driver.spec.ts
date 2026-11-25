import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderError } from '../domain/market-data.errors';
import { BrapiIndexDriver } from './brapi-index.driver';
import { FAKE_KEY, jsonResponse, testConfig } from './driver-test-support';

const HISTORY: unknown = {
    results: [
        {
            symbol: '^BVSP',
            regularMarketPrice: 166684.6,
            historicalDataPrice: [
                { date: 1795402800, open: 1, high: 2, low: 1, close: 165000.25, volume: 10, adjustedClose: 165000.25 },
                { date: 1795489200, open: 1, high: 2, low: 1, close: null, volume: 0, adjustedClose: 1 },
                { date: 1795575600, open: 1, high: 2, low: 1, close: 166684.6094, volume: 0, adjustedClose: 166684.6094 }
            ]
        }
    ]
};

describe('BrapiIndexDriver', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('pede o histórico diário do Ibovespa pela brapi e lê data de São Paulo e fechamento como decimal', async () => {
        const fetchMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(jsonResponse(HISTORY));
        vi.stubGlobal('fetch', fetchMock);
        const driver: BrapiIndexDriver = new BrapiIndexDriver(testConfig());

        const closes = await driver.fetchDaily('^BVSP', '3mo');

        expect(closes).toEqual([
            { date: '2026-11-23', close: '165000.25' },
            { date: '2026-11-25', close: '166684.6094' }
        ]);
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://brapi.test/api/quote/%5EBVSP?range=3mo&interval=1d');
        expect(init.headers).toEqual({ Authorization: `Bearer ${FAKE_KEY}` });
        expect(driver.source).toBe('brapi');
        expect(driver.configured).toBe(true);
    });

    it('resposta sem histórico para o símbolo devolve lista vazia', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ results: [{ symbol: '^BVSP' }] })));

        expect(await new BrapiIndexDriver(testConfig()).fetchDaily('^BVSP', '1mo')).toEqual([]);
    });

    it('sem token não está configurado e não chama a rede', async () => {
        const fetchMock: ReturnType<typeof vi.fn> = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const driver: BrapiIndexDriver = new BrapiIndexDriver(testConfig({ BRAPI_TOKEN: 'unset' }));

        expect(driver.configured).toBe(false);
        await expect(driver.fetchDaily('^BVSP', '1mo')).rejects.toBeInstanceOf(ProviderError);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('plano sem o período devolve erro do provedor, e formato inesperado vira formato inválido', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({ error: true, code: 'INVALID_RANGE' }, 403)));
        const driver: BrapiIndexDriver = new BrapiIndexDriver(testConfig());

        await expect(driver.fetchDaily('^BVSP', '1y')).rejects.toMatchObject({ reason: 'market-data.provider_rejected' });

        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({ unexpected: true })));
        await expect(driver.fetchDaily('^BVSP', '1mo')).rejects.toMatchObject({ reason: 'market-data.provider_format_invalid' });
    });

    it('a faixa de histórico vem da configuração, com 3mo como padrão do plano gratuito', () => {
        expect(testConfig().BRAPI_INDEX_HISTORY_RANGE).toBe('3mo');
        expect(testConfig({ BRAPI_INDEX_HISTORY_RANGE: '10y' }).BRAPI_INDEX_HISTORY_RANGE).toBe('10y');
        expect(() => testConfig({ BRAPI_INDEX_HISTORY_RANGE: '7d' })).toThrow();
    });
});
