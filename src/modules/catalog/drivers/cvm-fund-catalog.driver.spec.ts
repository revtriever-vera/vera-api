import { ConfigType } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogConfig } from '../config/catalog.config';
import { SourceAsset } from '../ports/asset-source.port';
import { CatalogLogService } from '../services/catalog-log.service';
import { CvmDailyInformeReaderService } from '../services/cvm-daily-informe-reader.service';
import { CvmFundCatalogDriver } from './cvm-fund-catalog.driver';
import { fixtureText, fixtureZip, zipResponse } from './fixtures/cvm-fixtures';
import { makeZip } from './fixtures/make-zip';

type Config = ConfigType<typeof catalogConfig>;

const BASE: string = 'https://cvm.example/dados';
const REGISTRY: string = `${BASE}/FI/CAD/DADOS/registro_fundo_classe.zip`;
const INFORME: string = `${BASE}/FI/DOC/INF_DIARIO/DADOS/inf_diario_fi_202611.zip`;
const PREVIOUS_INFORME: string = `${BASE}/FI/DOC/INF_DIARIO/DADOS/inf_diario_fi_202610.zip`;

function registry(): Response {
    return zipResponse(
        makeZip([
            { name: 'registro_classe.csv', content: fixtureText('fund-registro-classe-sample.csv'), deflate: true },
            { name: 'registro_subclasse.csv', content: fixtureText('fund-registro-subclasse-sample.csv'), deflate: true }
        ])
    );
}

function informe(): Response {
    return zipResponse(fixtureZip('inf_diario_fi_202611.csv', 'inf-diario-current-sample.csv'));
}

function rig(): { driver: CvmFundCatalogDriver; fundCatalogBuilt: ReturnType<typeof vi.fn> } {
    const config: Config = { CATALOG_DRIVER: 'live', CVM_DATA_BASE_URL: BASE, CATALOG_HTTP_TIMEOUT_MS: 1000 } as Config;
    const fundCatalogBuilt: ReturnType<typeof vi.fn> = vi.fn();
    const logs: CatalogLogService = { fundCatalogBuilt, informeRead: vi.fn() } as unknown as CatalogLogService;
    return { driver: new CvmFundCatalogDriver(config, new CvmDailyInformeReaderService(config, logs), logs), fundCatalogBuilt };
}

function serve(responses: Readonly<Record<string, () => Response>>): ReturnType<typeof vi.fn> {
    const mock = vi.fn((url: string): Promise<Response> => Promise.resolve(responses[url]?.() ?? new Response('', { status: 404 })));
    vi.stubGlobal('fetch', mock);
    return mock;
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-23T15:00:00Z'));
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('CvmFundCatalogDriver', () => {
    it('writes only the series with a quota in the daily informe, one per class or subclass', async () => {
        const fetchMock = serve({ [REGISTRY]: registry, [INFORME]: informe });
        const { driver, fundCatalogBuilt } = rig();

        const assets: readonly SourceAsset[] = await driver.fetchAll();

        expect(assets.map((asset: SourceAsset) => asset.externalId)).toEqual([
            '11111111000191',
            '22222222000191:BETA0001',
            '33333333000191:GAMA0001',
            '44444444000191',
            '12121212000191'
        ]);
        expect(assets.every((asset: SourceAsset) => asset.kind === 'fund' && asset.currency === 'BRL')).toBe(true);
        expect(assets.map((asset: SourceAsset) => asset.symbol)).toEqual([
            '11111111000191',
            '22222222000191',
            '33333333000191',
            '44444444000191',
            '12121212000191'
        ]);
        expect(fundCatalogBuilt).toHaveBeenCalledWith({
            classesRead: 12,
            classesFiltered: 7,
            seriesWithQuota: 7,
            seriesWritten: 5,
            seriesWithoutQuota: 2
        });
        expect(fetchMock.mock.calls.map((call: unknown[]) => call[0])).toEqual([REGISTRY, INFORME]);
    });

    it('keeps the full denomination and the CVM classification in raw', async () => {
        serve({ [REGISTRY]: registry, [INFORME]: informe });

        const assets: readonly SourceAsset[] = await rig().driver.fetchAll();

        expect(assets[0]).toMatchObject({
            name: 'ALFA RENDA FIXA',
            raw: {
                cnpj: '11111111000191',
                fullName: 'ALFA RENDA FIXA FIF CLASSE DE INVESTIMENTO RESP LIMITADA',
                classification: 'Renda Fixa',
                anbima: 'Renda Fixa Simples'
            }
        });
    });

    it('also reads the previous month during the first five business days', async () => {
        vi.setSystemTime(new Date('2026-11-05T15:00:00Z'));
        const fetchMock = serve({ [REGISTRY]: registry, [INFORME]: informe, [PREVIOUS_INFORME]: informe });

        await rig().driver.fetchAll();

        expect(fetchMock.mock.calls.map((call: unknown[]) => call[0])).toEqual([REGISTRY, INFORME, PREVIOUS_INFORME]);
    });

    it('fails without a partial catalog when the registry is missing', async () => {
        serve({ [INFORME]: informe });

        await expect(rig().driver.fetchAll()).rejects.toMatchObject({ errorCode: 'catalog.source_rejected' });
    });

    it('fails when the registry changes its layout', async () => {
        serve({
            [REGISTRY]: () =>
                zipResponse(makeZip([{ name: 'registro_classe.csv', content: Buffer.from('A;B\r\n1;2\r\n'), deflate: true }])),
            [INFORME]: informe
        });

        await expect(rig().driver.fetchAll()).rejects.toMatchObject({ errorCode: 'catalog.source_format_invalid' });
    });

    it('fails when the informe has no quota column', async () => {
        serve({
            [REGISTRY]: registry,
            [INFORME]: () =>
                zipResponse(makeZip([{ name: 'x.csv', content: Buffer.from('CNPJ_FUNDO_CLASSE;DT_COMPTC\r\n1;2\r\n'), deflate: true }]))
        });

        await expect(rig().driver.fetchAll()).rejects.toMatchObject({ errorCode: 'catalog.source_format_invalid' });
    });
});
