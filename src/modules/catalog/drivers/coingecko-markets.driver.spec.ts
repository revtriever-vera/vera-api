import { ConfigType } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogConfig } from '../config/catalog.config';
import { SourceAsset } from '../ports/asset-source.port';
import { CoinGeckoMarketsDriver } from './coingecko-markets.driver';

type Config = ConfigType<typeof catalogConfig>;

function config(key: string | undefined): Config {
    return { COINGECKO_API_KEY: key, COINGECKO_BASE_URL: 'https://coingecko.example/api/v3', CATALOG_HTTP_TIMEOUT_MS: 1000 } as Config;
}

function page(from: number, size: number): unknown[] {
    return Array.from({ length: size }, (_unused: unknown, index: number) => ({
        id: `coin-${String(from + index)}`,
        symbol: `c${String(from + index)}`,
        name: `Coin ${String(from + index)}`,
        market_cap_rank: from + index
    }));
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('CoinGeckoMarketsDriver', () => {
    it('reads four pages of 250 and orders the result by market cap rank', async () => {
        const fetchMock = vi.fn().mockImplementation(async (url: string) => {
            const requested: number = Number(new URL(url).searchParams.get('page'));
            return Promise.resolve(new Response(JSON.stringify(page((requested - 1) * 250 + 1, 250)), { status: 200 }));
        });
        vi.stubGlobal('fetch', fetchMock);

        const assets: readonly SourceAsset[] = await new CoinGeckoMarketsDriver(config('chave-falsa')).fetchAll();

        expect(fetchMock).toHaveBeenCalledTimes(4);
        expect(assets).toHaveLength(1000);
        expect(assets[0]).toMatchObject({ externalId: 'coin-1', symbol: 'C1', kind: 'crypto', currency: 'USD', rank: 1 });
        expect(assets[999]?.rank).toBe(1000);
        const first: [string, { headers: Record<string, string> }] = fetchMock.mock.calls[0] as [
            string,
            { headers: Record<string, string> }
        ];
        expect(first[0]).toContain('per_page=250');
        expect(first[0]).not.toContain('chave-falsa');
        expect(first[1].headers['x-cg-demo-api-key']).toBe('chave-falsa');
    });

    it('sorts out of order pages, dedupes ids and ranks coins without rank after the ranked ones', async () => {
        const pages: unknown[][] = [
            [
                { id: 'b', symbol: 'b', name: 'B', market_cap_rank: 2 },
                { id: 'x', symbol: 'x', name: 'X', market_cap_rank: null }
            ],
            [{ id: 'a', symbol: 'a', name: 'A', market_cap_rank: 1 }],
            [{ id: 'b', symbol: 'b', name: 'B', market_cap_rank: 2 }],
            []
        ];
        let call: number = 0;
        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation(async () => {
                call += 1;
                return Promise.resolve(new Response(JSON.stringify(pages[call - 1]), { status: 200 }));
            })
        );

        const assets: readonly SourceAsset[] = await new CoinGeckoMarketsDriver(config('chave-falsa')).fetchAll();

        expect(assets.map((asset: SourceAsset) => asset.externalId)).toEqual(['a', 'b', 'x']);
        expect(assets[2]?.rank).toBe(3);
    });

    it('turns a 5xx on any page into a neutral source error', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 502 })));

        await expect(new CoinGeckoMarketsDriver(config('chave-falsa')).fetchAll()).rejects.toMatchObject({
            errorCode: 'catalog.source_unavailable'
        });
    });

    it('fails with a format error on an unexpected payload', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'x' }), { status: 200 })));

        await expect(new CoinGeckoMarketsDriver(config('chave-falsa')).fetchAll()).rejects.toMatchObject({
            errorCode: 'catalog.source_format_invalid'
        });
    });

    it('refuses to run without a key', async () => {
        await expect(new CoinGeckoMarketsDriver(config(undefined)).fetchAll()).rejects.toMatchObject({
            errorCode: 'catalog.source_rejected'
        });
    });
});
