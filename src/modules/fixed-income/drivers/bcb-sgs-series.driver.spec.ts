import { afterEach, describe, expect, it, vi } from 'vitest';
import { IndexSourceError } from '../domain/fixed-income.errors';
import { BcbSgsSeriesDriver, fromSgsDate, toSgsDate } from './bcb-sgs-series.driver';

const CONFIG = {
    FIXED_INCOME_INDEX_DRIVER: 'bcb' as const,
    SGS_BASE_URL: 'https://sgs.example.test/',
    SGS_CDI_SERIES_CODE: 12,
    SGS_IPCA_SERIES_CODE: 433,
    SGS_TIMEOUT_MS: 1000,
    SGS_MAX_ATTEMPTS: 3,
    SGS_RETRY_BASE_DELAY_MS: 0
};

function respond(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status });
}

describe('BcbSgsSeriesDriver', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('converte datas entre ISO e DD/MM/AAAA', () => {
        expect(toSgsDate('2025-03-07')).toBe('07/03/2025');
        expect(fromSgsDate('07/03/2025')).toBe('2025-03-07');
    });

    it('monta a URL do SGS e lê datas DD/MM/AAAA e valor com ponto decimal', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            respond(200, [
                { data: '06/01/2025', valor: '0.043739' },
                { data: '07/01/2025', valor: '0.043739' }
            ])
        );
        vi.stubGlobal('fetch', fetchMock);

        const points = await new BcbSgsSeriesDriver(CONFIG).fetch('cdi_daily', '2025-01-06', '2025-01-07');

        expect(points).toEqual([
            { date: '2025-01-06', value: '0.043739' },
            { date: '2025-01-07', value: '0.043739' }
        ]);
        expect(fetchMock.mock.calls[0]?.[0]).toBe(
            'https://sgs.example.test/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=06/01/2025&dataFinal=07/01/2025'
        );
    });

    it('usa o código do IPCA e aceita valor negativo', async () => {
        const fetchMock = vi.fn().mockResolvedValue(respond(200, [{ data: '01/08/2026', valor: '-0.32' }]));
        vi.stubGlobal('fetch', fetchMock);

        const points = await new BcbSgsSeriesDriver(CONFIG).fetch('ipca_monthly', '2026-08-01', '2026-08-31');

        expect(points).toEqual([{ date: '2026-08-01', value: '-0.32' }]);
        expect(String(fetchMock.mock.calls[0]?.[0])).toContain('bcdata.sgs.433');
    });

    it('tenta de novo em 5xx e devolve o que veio na tentativa seguinte', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(respond(503, { erro: 'indisponível' }))
            .mockResolvedValueOnce(respond(200, [{ data: '06/01/2025', valor: '0.05' }]));
        vi.stubGlobal('fetch', fetchMock);

        const points = await new BcbSgsSeriesDriver(CONFIG).fetch('cdi_daily', '2025-01-06', '2025-01-06');

        expect(points).toHaveLength(1);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('esgota as tentativas sem vazar o corpo cru no erro', async () => {
        const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(respond(500, { segredo: 'corpo-cru-do-servidor' })));
        vi.stubGlobal('fetch', fetchMock);

        const failure: unknown = await new BcbSgsSeriesDriver(CONFIG)
            .fetch('cdi_daily', '2025-01-06', '2025-01-06')
            .catch((e: unknown) => e);

        expect(failure).toBeInstanceOf(IndexSourceError);
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(JSON.stringify({ message: (failure as Error).message, meta: (failure as IndexSourceError).meta })).not.toContain(
            'corpo-cru'
        );
        expect((failure as IndexSourceError).meta).toEqual({ series: 'cdi_daily', reason: 'status_500' });
    });

    it('erro de rede é repetido e depois falha', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
        vi.stubGlobal('fetch', fetchMock);

        await expect(new BcbSgsSeriesDriver(CONFIG).fetch('cdi_daily', '2025-01-06', '2025-01-06')).rejects.toBeInstanceOf(
            IndexSourceError
        );
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('4xx e payload fora do formato não são repetidos', async () => {
        const client = vi.fn().mockResolvedValue(respond(400, {}));
        vi.stubGlobal('fetch', client);
        await expect(new BcbSgsSeriesDriver(CONFIG).fetch('cdi_daily', '2025-01-06', '2025-01-06')).rejects.toBeInstanceOf(
            IndexSourceError
        );
        expect(client).toHaveBeenCalledTimes(1);

        const malformed = vi.fn().mockResolvedValue(respond(200, [{ data: '2025-01-06', valor: '0,05' }]));
        vi.stubGlobal('fetch', malformed);
        await expect(new BcbSgsSeriesDriver(CONFIG).fetch('cdi_daily', '2025-01-06', '2025-01-06')).rejects.toMatchObject({
            meta: { reason: 'invalid_payload' }
        });
        expect(malformed).toHaveBeenCalledTimes(1);
    });

    it('espera o backoff exponencial entre as tentativas', async () => {
        vi.useFakeTimers();
        const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(respond(500, {})));
        vi.stubGlobal('fetch', fetchMock);
        const driver = new BcbSgsSeriesDriver({ ...CONFIG, SGS_RETRY_BASE_DELAY_MS: 100 });

        const pending = driver.fetch('cdi_daily', '2025-01-06', '2025-01-06').catch((e: unknown) => e);
        await vi.advanceTimersByTimeAsync(100);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(200);
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(await pending).toBeInstanceOf(IndexSourceError);
        vi.useRealTimers();
    });
});
