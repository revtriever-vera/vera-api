import { ConfigType } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogConfig } from '../config/catalog.config';
import { SourceAsset } from '../ports/asset-source.port';
import { FinnhubSymbolsDriver } from './finnhub-symbols.driver';

type Config = ConfigType<typeof catalogConfig>;

function config(key: string | undefined): Config {
    return { FINNHUB_API_KEY: key, FINNHUB_BASE_URL: 'https://finnhub.example/api/v1', CATALOG_HTTP_TIMEOUT_MS: 1000 } as Config;
}

function json(body: unknown, status: number = 200): Response {
    return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

const LISTING: unknown[] = [
    { symbol: 'AAPL', description: 'APPLE INC', type: 'Common Stock', mic: 'XNAS' },
    { symbol: 'VOO', description: 'VANGUARD S&P 500 ETF', type: 'ETP', mic: 'ARCX' },
    { symbol: 'BABA', description: 'ALIBABA GROUP', type: 'ADR', mic: 'XNYS' },
    { symbol: 'AMC', description: 'AMC ENTERTAINMENT', type: 'Common Stock', mic: 'XASE' },
    { symbol: 'O', description: 'REALTY INCOME', type: 'REIT', mic: 'XNYS' },
    { symbol: 'BAC.PRB', description: 'BANK OF AMERICA PFD', type: 'Preferred Stock', mic: 'XNYS' },
    { symbol: 'CEF', description: 'SOME CLOSED END FUND', type: 'Closed-End Fund', mic: 'XNYS' },
    { symbol: 'OTCX', description: 'OTC NAME', type: 'Common Stock', mic: 'OOTC' },
    { symbol: 'NODESC', type: 'Common Stock', mic: 'XNYS' }
];

describe('FinnhubSymbolsDriver', () => {
    it('keeps stocks, ADRs, ETFs and REITs of the US exchanges and drops the rest', async () => {
        const fetchMock = vi.fn().mockResolvedValue(json(LISTING));
        vi.stubGlobal('fetch', fetchMock);

        const assets: readonly SourceAsset[] = await new FinnhubSymbolsDriver(config('chave-falsa')).fetchAll();
        const kinds: Record<string, string> = Object.fromEntries(assets.map((asset: SourceAsset) => [asset.symbol, asset.kind]));

        expect(kinds).toEqual({ AAPL: 'stock', VOO: 'etf', BABA: 'stock', AMC: 'stock', O: 'reit', NODESC: 'stock' });
        expect(assets.every((asset: SourceAsset) => asset.currency === 'USD')).toBe(true);
        expect(assets.find((asset: SourceAsset) => asset.symbol === 'NODESC')?.name).toBe('NODESC');
    });

    it('sends the key in a header and never in the URL', async () => {
        const fetchMock = vi.fn().mockResolvedValue(json([]));
        vi.stubGlobal('fetch', fetchMock);

        await new FinnhubSymbolsDriver(config('chave-falsa')).fetchAll();

        const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
        expect(url).toBe('https://finnhub.example/api/v1/stock/symbol?exchange=US');
        expect(url).not.toContain('chave-falsa');
        expect(init.headers['X-Finnhub-Token']).toBe('chave-falsa');
    });

    it('turns 429 into a neutral source error', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: 'limite' }, 429)));

        await expect(new FinnhubSymbolsDriver(config('chave-falsa')).fetchAll()).rejects.toMatchObject({
            errorCode: 'catalog.source_rate_limited'
        });
    });

    it('fails with a format error when the payload is not the expected list', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ erro: true })));

        await expect(new FinnhubSymbolsDriver(config('chave-falsa')).fetchAll()).rejects.toMatchObject({
            errorCode: 'catalog.source_format_invalid'
        });
    });

    it('fails with a format error when the body is not JSON', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { status: 200 })));

        await expect(new FinnhubSymbolsDriver(config('chave-falsa')).fetchAll()).rejects.toMatchObject({
            errorCode: 'catalog.source_format_invalid'
        });
    });

    it('refuses to run without a key', async () => {
        await expect(new FinnhubSymbolsDriver(config(undefined)).fetchAll()).rejects.toMatchObject({
            errorCode: 'catalog.source_rejected'
        });
    });
});
