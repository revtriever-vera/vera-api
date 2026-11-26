import { ConfigType } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogConfig } from '../config/catalog.config';
import { fixtureZip, zipResponse } from '../drivers/fixtures/cvm-fixtures';
import { CvmIpeReaderService, IpeDocument } from './cvm-ipe-reader.service';

type Config = ConfigType<typeof catalogConfig>;

const BASE: string = 'https://cvm.example/dados';
const URL_2026: string = `${BASE}/CIA_ABERTA/DOC/IPE/DADOS/ipe_cia_aberta_2026.zip`;
const WINDOW = { today: '2026-11-25', deliveredSince: '2026-10-11' } as const;

function reader(): CvmIpeReaderService {
    return new CvmIpeReaderService({ CVM_DATA_BASE_URL: BASE, CATALOG_HTTP_TIMEOUT_MS: 1000 } as Config);
}

function serve(response: () => Response): ReturnType<typeof vi.fn> {
    const mock = vi.fn((url: string): Promise<Response> =>
        Promise.resolve(url === URL_2026 ? response() : new Response('', { status: 404 }))
    );
    vi.stubGlobal('fetch', mock);
    return mock;
}

const SAMPLE: () => Response = () => zipResponse(fixtureZip('ipe_cia_aberta_2026.csv', 'ipe-cia-aberta-sample.csv'), { etag: '"ipe"' });

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('CvmIpeReaderService', () => {
    it('keeps every category, delivered in the window or referring to a future date', async () => {
        serve(SAMPLE);

        const documents: readonly IpeDocument[] = await reader().documents(WINDOW);

        expect(documents.map((document: IpeDocument): number => document.sequence)).toEqual([100, 101, 102, 103, 105]);
    });

    it('reads the CNPJ as digits, the sequence of the document and the version', async () => {
        serve(SAMPLE);

        const [first, , , , last]: readonly IpeDocument[] = await reader().documents(WINDOW);

        expect(first).toMatchObject({
            cnpj: '01083200000118',
            category: 'Aviso aos Acionistas',
            subject: 'Dividendos/Juros sobre Capital Próprio',
            deliveryDate: '2026-11-20',
            version: 1
        });
        expect(last).toMatchObject({ cnpj: '43776517000180', type: 'Data prevista para a assembleia', version: 2 });
    });

    it('does not download again within the hour', async () => {
        const mock = serve(SAMPLE);
        const service: CvmIpeReaderService = reader();

        await service.documents(WINDOW);
        await service.documents(WINDOW);

        expect(mock).toHaveBeenCalledTimes(1);
    });

    it('asks for the previous year too when the window crosses the new year', async () => {
        const mock = serve(SAMPLE);

        await reader().documents({ today: '2026-01-10', deliveredSince: '2025-11-26' });

        expect(mock.mock.calls.map((call: unknown[]): unknown => call[0])).toEqual([
            `${BASE}/CIA_ABERTA/DOC/IPE/DADOS/ipe_cia_aberta_2025.zip`,
            URL_2026
        ]);
    });

    it('downloads again when a wider window is asked after a narrower one', async () => {
        const mock = serve(SAMPLE);
        const service: CvmIpeReaderService = reader();

        await service.documents({ today: '2026-11-25', deliveredSince: '2026-11-19' });
        const wider: readonly IpeDocument[] = await service.documents(WINDOW);

        expect(mock).toHaveBeenCalledTimes(2);
        expect(wider).toHaveLength(5);
    });

    it('fails when the source is unavailable', async () => {
        serve(() => new Response('', { status: 503 }));

        await expect(reader().documents(WINDOW)).rejects.toMatchObject({ name: 'CatalogSourceError' });
    });

    it('treats a year without a file as empty', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn((): Promise<Response> => Promise.resolve(new Response('', { status: 404 })))
        );

        await expect(reader().documents(WINDOW)).resolves.toEqual([]);
    });
});
