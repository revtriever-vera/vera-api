import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogConfig } from '../config/catalog.config';
import { CatalogSourceError } from '../domain/catalog.errors';
import { SourceAsset } from '../ports/asset-source.port';
import { B3InstrumentsDriver, kindOfCategory } from './b3-instruments.driver';
import { ConfigType } from '@nestjs/config';

type Config = ConfigType<typeof catalogConfig>;

const SAMPLE: string = readFileSync(join(__dirname, 'fixtures', 'b3-instruments-sample.csv'), 'utf-8');

function config(url: string | undefined): Config {
    return { CATALOG_DRIVER: 'live', B3_INSTRUMENTS_URL: url, CATALOG_HTTP_TIMEOUT_MS: 1000 } as Config;
}

function respond(body: string, status: number = 200): Response {
    return new Response(body, { status });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('B3InstrumentsDriver', () => {
    it('keeps cash-market stocks, units, FIIs, ETFs and BDRs and drops everything else', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(SAMPLE)));

        const assets: readonly SourceAsset[] = await new B3InstrumentsDriver(config('https://b3.example/instruments.csv')).fetchAll();
        const kinds: Record<string, string> = Object.fromEntries(assets.map((asset: SourceAsset) => [asset.symbol, asset.kind]));

        expect(kinds['ITUB4']).toBe('stock');
        expect(kinds['TAEE11']).toBe('stock');
        expect(kinds['HGLG11']).toBe('fii');
        expect(kinds['IVVB11']).toBe('etf');
        expect(kinds['GOLD11']).toBe('etf');
        expect(kinds['AAPL34']).toBe('bdr');
        expect(kinds['ITUB4F']).toBeUndefined();
        expect(kinds['PETRA280']).toBeUndefined();
        expect(kinds['DIRR3R1']).toBeUndefined();
        expect(kinds['WINZ26']).toBeUndefined();
    });

    it('deduplicates by ticker and sets BRL and the name from the file', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(SAMPLE)));

        const assets: readonly SourceAsset[] = await new B3InstrumentsDriver(config('https://b3.example/instruments.csv')).fetchAll();

        expect(assets.filter((asset: SourceAsset) => asset.symbol === 'ITUB4')).toHaveLength(1);
        expect(assets.find((asset: SourceAsset) => asset.symbol === 'ITUB4')).toMatchObject({ currency: 'BRL', externalId: 'ITUB4' });
        expect(assets).toHaveLength(24);
    });

    it('walks back day by day when the dated URL answers 404', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(respond('', 404)).mockResolvedValueOnce(respond(SAMPLE));
        vi.stubGlobal('fetch', fetchMock);

        const assets: readonly SourceAsset[] = await new B3InstrumentsDriver(config('https://b3.example/{date}.csv')).fetchAll();

        expect(assets.length).toBeGreaterThan(0);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        const first: string = (fetchMock.mock.calls[0] as [string])[0];
        const second: string = (fetchMock.mock.calls[1] as [string])[0];
        expect(first).toMatch(/\d{4}-\d{2}-\d{2}\.csv$/);
        expect(second).not.toBe(first);
    });

    it('gives up after the lookback window', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond('', 404)));

        await expect(new B3InstrumentsDriver(config('https://b3.example/{date}.csv')).fetchAll()).rejects.toMatchObject({
            errorCode: 'catalog.source_rejected'
        });
    });

    it('does not walk back on a fixed URL', async () => {
        const fetchMock = vi.fn().mockResolvedValue(respond('', 404));
        vi.stubGlobal('fetch', fetchMock);

        await expect(new B3InstrumentsDriver(config('https://b3.example/instruments.csv')).fetchAll()).rejects.toBeInstanceOf(
            CatalogSourceError
        );
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('turns 429 and 5xx into neutral source errors without the body', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond('segredo do provedor', 429)));
        const driver: B3InstrumentsDriver = new B3InstrumentsDriver(config('https://b3.example/instruments.csv'));

        const rateLimited: unknown = await driver.fetchAll().catch((error: unknown) => error);

        expect(rateLimited).toMatchObject({ errorCode: 'catalog.source_rate_limited', retryable: true });
        expect(JSON.stringify(rateLimited)).not.toContain('segredo');

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond('x', 503)));
        await expect(driver.fetchAll()).rejects.toMatchObject({ errorCode: 'catalog.source_unavailable' });
    });

    it('turns a network failure into an unreachable error', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET https://b3.example')));

        await expect(new B3InstrumentsDriver(config('https://b3.example/instruments.csv')).fetchAll()).rejects.toMatchObject({
            errorCode: 'catalog.source_unreachable',
            message: 'catalog.source_unreachable'
        });
    });

    it('fails with a format error when the header is missing or lacks columns', async () => {
        const driver: B3InstrumentsDriver = new B3InstrumentsDriver(config('https://b3.example/instruments.csv'));

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond('apenas;texto\n1;2\n')));
        await expect(driver.fetchAll()).rejects.toMatchObject({ errorCode: 'catalog.source_format_invalid' });

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond('TckrSymb;Outra\nA;B\n')));
        await expect(driver.fetchAll()).rejects.toMatchObject({ errorCode: 'catalog.source_format_invalid' });
    });

    it('refuses to run without the configured URL', async () => {
        await expect(new B3InstrumentsDriver(config(undefined)).fetchAll()).rejects.toMatchObject({ errorCode: 'catalog.source_rejected' });
    });

    it('maps categories case-insensitively', () => {
        expect(kindOfCategory(' shares ')).toBe('stock');
        expect(kindOfCategory('ETF-FIXED INCOME')).toBe('etf');
        expect(kindOfCategory('RIGHTS')).toBeNull();
    });
});
