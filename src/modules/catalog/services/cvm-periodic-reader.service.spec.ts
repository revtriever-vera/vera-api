import { ConfigType } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogConfig } from '../config/catalog.config';
import { fixtureZip, zipResponse } from '../drivers/fixtures/cvm-fixtures';
import { CvmPeriodicReaderService, PeriodicDocument } from './cvm-periodic-reader.service';

type Config = ConfigType<typeof catalogConfig>;

const BASE: string = 'https://cvm.example/dados';
const URL_ITR_2026: string = `${BASE}/CIA_ABERTA/DOC/ITR/DADOS/itr_cia_aberta_2026.zip`;
const WINDOW = { today: '2026-11-25', deliveredSince: '2026-10-11' } as const;

function reader(): CvmPeriodicReaderService {
    return new CvmPeriodicReaderService({ CVM_DATA_BASE_URL: BASE, CATALOG_HTTP_TIMEOUT_MS: 1000 } as Config);
}

function serve(response: () => Response): ReturnType<typeof vi.fn> {
    const mock = vi.fn((url: string): Promise<Response> =>
        Promise.resolve(url === URL_ITR_2026 ? response() : new Response('', { status: 404 }))
    );
    vi.stubGlobal('fetch', mock);
    return mock;
}

const SAMPLE: () => Response = () => zipResponse(fixtureZip('itr_cia_aberta_2026.csv', 'itr-cia-aberta-sample.csv'), { etag: '"itr"' });

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('CvmPeriodicReaderService', () => {
    it('keeps the deliveries inside the window and reads the CNPJ as digits', async () => {
        serve(SAMPLE);

        const documents: readonly PeriodicDocument[] = await reader().documents('ITR', WINDOW);

        expect(documents.map((document: PeriodicDocument): string => document.documentId)).toEqual(['300100', '300101', '300103']);
        expect(documents[0]).toMatchObject({
            cnpj: '01083200000118',
            kind: 'ITR',
            referenceDate: '2026-09-30',
            deliveryDate: '2026-11-12',
            version: 1
        });
    });

    it('does not download again within the hour', async () => {
        const mock = serve(SAMPLE);
        const service: CvmPeriodicReaderService = reader();

        await service.documents('ITR', WINDOW);
        await service.documents('ITR', WINDOW);

        expect(mock).toHaveBeenCalledTimes(1);
    });

    it('asks for the dfp folder and the previous year when the window crosses the new year', async () => {
        const mock = serve(SAMPLE);

        await reader().documents('DFP', { today: '2026-01-10', deliveredSince: '2025-11-26' });

        expect(mock.mock.calls.map((call: unknown[]): unknown => call[0])).toEqual([
            `${BASE}/CIA_ABERTA/DOC/DFP/DADOS/dfp_cia_aberta_2025.zip`,
            `${BASE}/CIA_ABERTA/DOC/DFP/DADOS/dfp_cia_aberta_2026.zip`
        ]);
    });

    it('reuses the cached year when the source answers not modified', async () => {
        vi.useFakeTimers();
        const service: CvmPeriodicReaderService = reader();
        serve(SAMPLE);
        await service.documents('ITR', WINDOW);
        serve(() => new Response(null, { status: 304 }));
        vi.advanceTimersByTime(2 * 60 * 60 * 1000);

        const documents: readonly PeriodicDocument[] = await service.documents('ITR', WINDOW);
        vi.useRealTimers();

        expect(documents).toHaveLength(3);
    });

    it('fails when the source is unavailable', async () => {
        serve(() => new Response('', { status: 503 }));

        await expect(reader().documents('ITR', WINDOW)).rejects.toMatchObject({ name: 'CatalogSourceError' });
    });

    it('treats a year without a file as empty', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn((): Promise<Response> => Promise.resolve(new Response('', { status: 404 })))
        );

        await expect(reader().documents('ITR', WINDOW)).resolves.toEqual([]);
    });
});
