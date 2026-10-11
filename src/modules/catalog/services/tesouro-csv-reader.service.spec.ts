import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigType } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogConfig } from '../config/catalog.config';
import { decimalOf, isoDateOf, TesouroBond, TesouroCsvReaderService, TesouroReadResult } from './tesouro-csv-reader.service';

type Config = ConfigType<typeof catalogConfig>;

const SAMPLE: string = readFileSync(join(__dirname, '..', 'drivers', 'fixtures', 'tesouro-prices-sample.csv'), 'utf-8');
const URL_FIXED: string = 'https://tesouro.example/prices.csv';

function service(url: string | null = URL_FIXED): TesouroCsvReaderService {
    return new TesouroCsvReaderService({ TESOURO_PRICES_CSV_URL: url ?? undefined, CATALOG_HTTP_TIMEOUT_MS: 1000 } as Config);
}

function csv(body: string, headers: Record<string, string> = {}): Response {
    return new Response(body, { status: 200, headers });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('TesouroCsvReaderService', () => {
    it('returns only the rows of the most recent Data Base', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(csv(SAMPLE)));

        const result: TesouroReadResult = await service().readLatest();

        expect(result.changed).toBe(true);
        if (!result.changed) {
            return;
        }
        expect(result.baseDate).toBe('2026-10-08');
        expect(result.bonds).toHaveLength(10);
        expect(result.bonds.every((bond: TesouroBond) => bond.baseDate === '2026-10-08')).toBe(true);
    });

    it('parses dates and Brazilian decimals', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(csv(SAMPLE)));

        const result: TesouroReadResult = await service().readLatest();

        expect(result.changed && result.bonds[0]).toEqual({
            typeName: 'Tesouro Selic',
            maturityDate: '2029-03-01',
            baseDate: '2026-10-08',
            baseUnitPrice: '15232.00',
            buyUnitPrice: '15234.56',
            sellUnitPrice: '15230.10'
        });
    });

    it('sends If-None-Match and If-Modified-Since after the first read and reports no change on 304', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(csv(SAMPLE, { etag: '"abc"', 'last-modified': 'Thu, 08 Oct 2026 10:00:00 GMT' }))
            .mockResolvedValueOnce(new Response(null, { status: 304 }));
        vi.stubGlobal('fetch', fetchMock);
        const reader: TesouroCsvReaderService = service();

        await reader.readLatest();
        const second: TesouroReadResult = await reader.readLatest();

        expect(second).toEqual({ changed: false });
        const [, init] = fetchMock.mock.calls[1] as [string, { headers: Record<string, string> }];
        expect(init.headers).toEqual({ 'If-None-Match': '"abc"', 'If-Modified-Since': 'Thu, 08 Oct 2026 10:00:00 GMT' });
    });

    it('ignores the stored validators when asked to', async () => {
        const fetchMock = vi.fn().mockImplementation(async () => Promise.resolve(csv(SAMPLE, { etag: '"abc"' })));
        vi.stubGlobal('fetch', fetchMock);
        const reader: TesouroCsvReaderService = service();

        await reader.readLatest();
        await reader.readLatest({ ignoreCache: true });

        const [, init] = fetchMock.mock.calls[1] as [string, { headers: Record<string, string> }];
        expect(init.headers).toEqual({});
    });

    it('fails with a format error when the header lacks required columns', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(csv('Titulo;Vencimento\nA;B\n')));

        await expect(service().readLatest()).rejects.toMatchObject({ errorCode: 'catalog.source_format_invalid' });
    });

    it('fails with a format error when no row can be read', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(csv('Tipo Titulo;Data Vencimento;Data Base;PU Base Manha\n\nA;nao-data;nao-data;1\n'))
        );

        await expect(service().readLatest()).rejects.toMatchObject({ errorCode: 'catalog.source_format_invalid' });
    });

    it('turns HTTP failures into neutral source errors', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x', { status: 503 })));

        await expect(service().readLatest()).rejects.toMatchObject({ errorCode: 'catalog.source_unavailable' });
    });

    it('refuses to run without the configured URL', async () => {
        await expect(service(null).readLatest()).rejects.toMatchObject({ errorCode: 'catalog.source_rejected' });
    });

    it('converts dates and decimals', () => {
        expect(isoDateOf('15/05/2035')).toBe('2035-05-15');
        expect(isoDateOf('2035-05-15')).toBeNull();
        expect(decimalOf('1.234,56')).toBe('1234.56');
        expect(decimalOf('')).toBeNull();
        expect(decimalOf('abc')).toBeNull();
    });
});
