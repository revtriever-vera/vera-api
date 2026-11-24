import { ConfigType } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogConfig } from '../config/catalog.config';
import { fixtureZip, zipResponse } from '../drivers/fixtures/cvm-fixtures';
import { makeZip } from '../drivers/fixtures/make-zip';
import { CatalogLogService } from './catalog-log.service';
import { CvmDailyInformeReaderService, DailyQuote } from './cvm-daily-informe-reader.service';

type Config = ConfigType<typeof catalogConfig>;

const BASE: string = 'https://cvm.example/dados';
const CURRENT_URL: string = `${BASE}/FI/DOC/INF_DIARIO/DADOS/inf_diario_fi_202611.zip`;
const LEGACY_URL: string = `${BASE}/FI/DOC/INF_DIARIO/DADOS/inf_diario_fi_202012.zip`;

function rig(): { reader: CvmDailyInformeReaderService; informeRead: ReturnType<typeof vi.fn> } {
    const informeRead: ReturnType<typeof vi.fn> = vi.fn();
    const config: Config = { CVM_DATA_BASE_URL: BASE, CATALOG_HTTP_TIMEOUT_MS: 1000 } as Config;
    return { reader: new CvmDailyInformeReaderService(config, { informeRead } as unknown as CatalogLogService), informeRead };
}

function serve(responses: Readonly<Record<string, () => Response>>): ReturnType<typeof vi.fn> {
    const mock = vi.fn((url: string): Promise<Response> => Promise.resolve(responses[url]?.() ?? new Response('', { status: 404 })));
    vi.stubGlobal('fetch', mock);
    return mock;
}

const CURRENT: () => Response = () =>
    zipResponse(fixtureZip('inf_diario_fi_202611.csv', 'inf-diario-current-sample.csv'), { etag: '"current"' });
const LEGACY: () => Response = () => zipResponse(fixtureZip('inf_diario_fi_202012.csv', 'inf-diario-legacy-sample.csv'));

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('CvmDailyInformeReaderService', () => {
    it('lists the series of the current header, with the subclass in the key and the CNPJ as digits', async () => {
        serve({ [CURRENT_URL]: CURRENT });

        const keys: ReadonlySet<string> = await rig().reader.seriesKeys(['202611']);

        expect([...keys].sort()).toEqual([
            '11111111000191',
            '12121212000191',
            '22222222000191:BETA0001',
            '22222222000191:BETA0002',
            '33333333000191:GAMA0001',
            '44444444000191',
            '55555555000191'
        ]);
    });

    it('reads the legacy header that has neither the fund type nor the subclass', async () => {
        serve({ [LEGACY_URL]: LEGACY });

        const keys: ReadonlySet<string> = await rig().reader.seriesKeys(['202012']);

        expect([...keys].sort()).toEqual(['11111111000191', '33333333000191']);
    });

    it('returns the latest date per series as a decimal string, whatever the row order', async () => {
        serve({ [CURRENT_URL]: CURRENT });
        const wanted: ReadonlySet<string> = new Set<string>([
            '11111111000191',
            '22222222000191:BETA0001',
            '22222222000191:BETA0002',
            'ausente'
        ]);

        const quotes: ReadonlyMap<string, DailyQuote> = await rig().reader.latestQuotes(['202611'], wanted);

        expect(Object.fromEntries(quotes)).toEqual({
            '11111111000191': { date: '2026-11-05', quota: '1.510000000000' },
            '22222222000191:BETA0001': { date: '2026-11-05', quota: '10.250000000000' },
            '22222222000191:BETA0002': { date: '2026-11-05', quota: '11.000000000000' }
        });
    });

    it('prefers the newest date across months', async () => {
        serve({ [CURRENT_URL]: CURRENT, [LEGACY_URL]: LEGACY });

        const quotes: ReadonlyMap<string, DailyQuote> = await rig().reader.latestQuotes(
            ['202012', '202611'],
            new Set<string>(['11111111000191', '33333333000191'])
        );
        const older: ReadonlyMap<string, DailyQuote> = await rig().reader.latestQuotes(
            ['202611', '202012'],
            new Set<string>(['33333333000191'])
        );

        expect(quotes.get('11111111000191')).toEqual({ date: '2026-11-05', quota: '1.510000000000' });
        expect(quotes.get('33333333000191')).toEqual({ date: '2020-12-30', quota: '2.200000000000' });
        expect(older.get('33333333000191')).toEqual({ date: '2020-12-30', quota: '2.200000000000' });
    });

    it('sends If-None-Match on the second read and answers from memory on 304', async () => {
        const fetchMock = serve({ [CURRENT_URL]: CURRENT });
        const { reader, informeRead } = rig();
        await reader.seriesKeys(['202611']);
        fetchMock.mockImplementationOnce((): Promise<Response> => Promise.resolve(new Response(null, { status: 304 })));

        const keys: ReadonlySet<string> = await reader.seriesKeys(['202611']);

        expect(keys.size).toBe(7);
        expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ headers: { 'If-None-Match': '"current"' } });
        expect(informeRead).toHaveBeenNthCalledWith(1, '202611', false, 9, expect.any(Number));
        expect(informeRead).toHaveBeenNthCalledWith(2, '202611', true, 0, expect.any(Number));
    });

    it('does not send If-None-Match when the server gave no ETag', async () => {
        const fetchMock = serve({ [LEGACY_URL]: LEGACY });
        const { reader } = rig();

        await reader.seriesKeys(['202012']);
        await reader.seriesKeys(['202012']);

        expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ headers: {} });
    });

    it('treats a month that is not published yet as empty', async () => {
        serve({});

        expect((await rig().reader.seriesKeys(['202612'])).size).toBe(0);
    });

    it('keeps at most four months in memory', async () => {
        const fetchMock = serve({ [CURRENT_URL]: CURRENT });
        const { reader } = rig();
        const months: string[] = ['202607', '202608', '202609', '202610', '202611'];
        fetchMock.mockImplementation(() => Promise.resolve(CURRENT()));

        await reader.seriesKeys(months);
        await reader.seriesKeys(['202607']);

        expect(fetchMock.mock.calls.at(-1)?.[1]).toMatchObject({ headers: {} });
    });

    it.each([
        ['an HTTP error', (): Response => new Response('', { status: 503 }), 'catalog.source_unavailable'],
        [
            'a header without the quota column',
            (): Response =>
                zipResponse(makeZip([{ name: 'x.csv', content: Buffer.from('CNPJ_FUNDO;DT_COMPTC\r\n1;2\r\n'), deflate: true }])),
            'catalog.source_format_invalid'
        ],
        [
            'a header without any CNPJ column',
            (): Response => zipResponse(makeZip([{ name: 'x.csv', content: Buffer.from('DT_COMPTC;VL_QUOTA\r\n1;2\r\n'), deflate: true }])),
            'catalog.source_format_invalid'
        ],
        [
            'a file with no header',
            (): Response => zipResponse(makeZip([{ name: 'x.csv', content: Buffer.from('\r\n'), deflate: true }])),
            'catalog.source_format_invalid'
        ],
        [
            'a body that is not a zip',
            (): Response => zipResponse(Buffer.from('not a zip file at all, just text padding it out')),
            'catalog.source_format_invalid'
        ]
    ])('fails with a source error on %s', async (_label: string, response: () => Response, code: string) => {
        serve({ [CURRENT_URL]: response });

        await expect(rig().reader.seriesKeys(['202611'])).rejects.toMatchObject({ errorCode: code });
    });

    it('fails when the network drops during the download', async () => {
        const broken: ReadableStream<Uint8Array> = new ReadableStream<Uint8Array>({
            start(controller: ReadableStreamDefaultController<Uint8Array>): void {
                controller.error(new Error('reset'));
            }
        });
        serve({ [CURRENT_URL]: (): Response => new Response(broken, { status: 200 }) });

        await expect(rig().reader.seriesKeys(['202611'])).rejects.toMatchObject({ errorCode: 'catalog.source_unreachable' });
    });
});
