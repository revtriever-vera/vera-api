import { afterEach, describe, expect, it, vi } from 'vitest';
import { BcbPtaxDriver } from './bcb-ptax.driver';
import { jsonResponse, testConfig } from './driver-test-support';

const EMPTY: unknown = { value: [] };
const WITH_RATE: unknown = { value: [{ cotacaoVenda: 5.4231 }] };

describe('BcbPtaxDriver', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('returns the sell rate of the day as an exact decimal string', async () => {
        const fetchMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(jsonResponse(WITH_RATE));
        vi.stubGlobal('fetch', fetchMock);

        const rate = await new BcbPtaxDriver(testConfig()).fetch('USD', new Date('2026-10-09T17:00:00Z'));

        expect(rate).toEqual({ currency: 'USD', date: '2026-10-09', brlPerUnit: '5.4231', source: 'bcb-ptax' });
        expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
            "https://ptax.test/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='10-09-2026'&$top=1&$format=json&$select=cotacaoVenda"
        );
    });

    it('walks back over weekends and holidays until a day has a rate', async () => {
        const fetchMock: ReturnType<typeof vi.fn> = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse(EMPTY))
            .mockResolvedValueOnce(jsonResponse(EMPTY))
            .mockResolvedValueOnce(jsonResponse(WITH_RATE));
        vi.stubGlobal('fetch', fetchMock);

        const rate = await new BcbPtaxDriver(testConfig()).fetch('USD', new Date('2026-10-11T15:00:00Z'));

        expect(rate?.date).toBe('2026-10-09');
        expect(fetchMock.mock.calls.map((call: unknown[]) => (call[0] as string).match(/'(\d{2}-\d{2}-\d{4})'/)?.[1])).toEqual([
            '10-11-2026',
            '10-10-2026',
            '10-09-2026'
        ]);
    });

    it('gives up with null after seven days back without a rate', async () => {
        const fetchMock: ReturnType<typeof vi.fn> = vi.fn().mockImplementation(async () => Promise.resolve(jsonResponse(EMPTY)));
        vi.stubGlobal('fetch', fetchMock);

        const rate = await new BcbPtaxDriver(testConfig()).fetch('USD', new Date('2026-10-11T15:00:00Z'));

        expect(rate).toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(8);
    });

    it('does not call the service for unsupported currencies', async () => {
        const fetchMock: ReturnType<typeof vi.fn> = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        expect(await new BcbPtaxDriver(testConfig()).fetch('EUR', new Date())).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('propagates provider errors so the job can retry, and rejects a malformed body', async () => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValueOnce(new Response('x', { status: 503 }))
                .mockResolvedValueOnce(jsonResponse({ nope: 1 }))
        );
        const driver: BcbPtaxDriver = new BcbPtaxDriver(testConfig());

        await expect(driver.fetch('USD', new Date())).rejects.toMatchObject({ reason: 'market-data.provider_unavailable' });
        await expect(driver.fetch('USD', new Date())).rejects.toMatchObject({ stage: 'parse' });
    });

    it('ignores a non positive rate', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation(async () => Promise.resolve(jsonResponse({ value: [{ cotacaoVenda: 0 }] })))
        );

        expect(await new BcbPtaxDriver(testConfig()).fetch('USD', new Date('2026-10-09T17:00:00Z'))).toBeNull();
    });
});
