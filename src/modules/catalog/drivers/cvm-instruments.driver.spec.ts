import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigType } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogConfig } from '../config/catalog.config';
import { SourceAsset } from '../ports/asset-source.port';
import { CvmInstrumentsDriver } from './cvm-instruments.driver';
import { makeZip } from './fixtures/make-zip';

type Config = ConfigType<typeof catalogConfig>;

const BASE: string = 'https://cvm.example/dados';
const TODAY: Date = new Date('2026-11-23T15:00:00Z');

function text(name: string): Buffer {
    return Buffer.from(readFileSync(join(__dirname, 'fixtures', 'cvm', name), 'utf-8'), 'latin1');
}

function zip(entry: string, fixture: string): Buffer {
    return makeZip([{ name: entry, content: text(fixture), deflate: true }]);
}

function config(): Config {
    return { CATALOG_DRIVER: 'live', CVM_DATA_BASE_URL: BASE, CATALOG_HTTP_TIMEOUT_MS: 1000 } as Config;
}

function serve(files: Readonly<Record<string, Buffer>>): ReturnType<typeof vi.fn> {
    const mock = vi.fn((url: string): Promise<Response> => {
        const body: Buffer | undefined = files[url.replace(`${BASE}/`, '')];
        return Promise.resolve(
            body === undefined ? new Response('', { status: 404 }) : new Response(new Uint8Array(body), { status: 200 })
        );
    });
    vi.stubGlobal('fetch', mock);
    return mock;
}

const FILES: Readonly<Record<string, Buffer>> = {
    'FI/CAD/DADOS/registro_fundo_classe.zip': zip('registro_classe.csv', 'registro-classe-sample.csv'),
    'CIA_ABERTA/DOC/FCA/DADOS/fca_cia_aberta_2026.zip': zip(
        'fca_cia_aberta_valor_mobiliario_2026.csv',
        'fca-valor-mobiliario-2026-sample.csv'
    ),
    'CIA_ABERTA/DOC/FCA/DADOS/fca_cia_aberta_2025.zip': zip(
        'fca_cia_aberta_valor_mobiliario_2025.csv',
        'fca-valor-mobiliario-2025-sample.csv'
    ),
    'FII/DOC/INF_MENSAL/DADOS/inf_mensal_fii_2026.zip': zip('inf_mensal_fii_geral_2026.csv', 'inf-mensal-fii-geral-sample.csv'),
    'FIAGRO/DOC/INF_MENSAL/DADOS/inf_mensal_fiagro_202610.zip': zip('inf_mensal_fiagro_202610.csv', 'inf-mensal-fiagro-sample.csv'),
    'FI/DOC/CDA/DADOS/cda_fi_202609.zip': zip('cda_fi_BLC_4_202609.csv', 'cda-blc4-sample.csv')
};

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(TODAY);
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('CvmInstrumentsDriver', () => {
    it('serves the B3 market from the CVM open data only, one asset per ticker, with every kind', async () => {
        const fetchMock = serve(FILES);

        const assets: readonly SourceAsset[] = await new CvmInstrumentsDriver(config()).fetchAll();
        const kinds: Record<string, string> = Object.fromEntries(assets.map((asset: SourceAsset) => [asset.symbol, asset.kind]));

        expect(kinds).toMatchObject({
            ITUB4: 'stock',
            TAEE11: 'stock',
            BPAC11: 'stock',
            INBR32: 'bdr',
            AAPL34: 'bdr',
            HGLG11: 'fii',
            KNCA11: 'fii',
            BOVA11: 'etf',
            IVVB11: 'etf'
        });
        expect(new Set(assets.map((asset: SourceAsset) => asset.externalId)).size).toBe(assets.length);
        const urls: string[] = fetchMock.mock.calls.map((call: unknown[]) => String(call[0]));
        expect(urls.every((url: string) => url.startsWith(`${BASE}/`))).toBe(true);
    });

    it('prefers the company registry over the fund portfolios for the same ticker', async () => {
        serve(FILES);

        const assets: readonly SourceAsset[] = await new CvmInstrumentsDriver(config()).fetchAll();

        expect(assets.find((asset: SourceAsset) => asset.symbol === 'TAEE11')?.raw).toHaveProperty('cnpj');
    });

    it('walks back month by month when the newest monthly file is not published yet', async () => {
        const withoutSeptember: Record<string, Buffer> = { ...FILES };
        delete withoutSeptember['FI/DOC/CDA/DADOS/cda_fi_202609.zip'];
        serve({ ...withoutSeptember, 'FI/DOC/CDA/DADOS/cda_fi_202608.zip': zip('cda_fi_BLC_4_202608.csv', 'cda-blc4-sample.csv') });

        const assets: readonly SourceAsset[] = await new CvmInstrumentsDriver(config()).fetchAll();

        expect(assets.some((asset: SourceAsset) => asset.symbol === 'AAPL34')).toBe(true);
    });

    it('fails with a rejected source when the fund registry is missing', async () => {
        const withoutRegistry: Record<string, Buffer> = { ...FILES };
        delete withoutRegistry['FI/CAD/DADOS/registro_fundo_classe.zip'];
        serve(withoutRegistry);

        await expect(new CvmInstrumentsDriver(config()).fetchAll()).rejects.toMatchObject({ errorCode: 'catalog.source_rejected' });
    });

    it('fails when no monthly portfolio file exists in the lookback window', async () => {
        const withoutPortfolio: Record<string, Buffer> = { ...FILES };
        delete withoutPortfolio['FI/DOC/CDA/DADOS/cda_fi_202609.zip'];
        serve(withoutPortfolio);

        await expect(new CvmInstrumentsDriver(config()).fetchAll()).rejects.toMatchObject({ errorCode: 'catalog.source_rejected' });
    });

    it('maps server errors, rate limiting and network failures to source errors', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
        await expect(new CvmInstrumentsDriver(config()).fetchAll()).rejects.toMatchObject({ errorCode: 'catalog.source_unavailable' });

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })));
        await expect(new CvmInstrumentsDriver(config()).fetchAll()).rejects.toMatchObject({ errorCode: 'catalog.source_rate_limited' });

        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
        await expect(new CvmInstrumentsDriver(config()).fetchAll()).rejects.toMatchObject({ errorCode: 'catalog.source_unreachable' });
    });

    it('rejects a body that is not a zip archive', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>manutencao</html>', { status: 200 })));

        await expect(new CvmInstrumentsDriver(config()).fetchAll()).rejects.toMatchObject({ errorCode: 'catalog.source_format_invalid' });
    });
});
