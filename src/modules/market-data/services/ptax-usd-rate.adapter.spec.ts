import { describe, expect, it, vi } from 'vitest';
import { UsdRateHolder } from '../../../core/usage/ports/usd-rate.holder';
import { ExchangeRateReaderService } from './exchange-rate-reader.service';
import { PtaxUsdRateAdapter } from './ptax-usd-rate.adapter';

const NOW: Date = new Date('2026-11-10T15:00:00.000Z');

function adapter(stored: { date: string; brlPerUnit: string } | null): { adapter: PtaxUsdRateAdapter; register: ReturnType<typeof vi.fn> } {
    const register = vi.fn();
    const rates = { latest: vi.fn().mockResolvedValue(stored) } as unknown as ExchangeRateReaderService;
    return { adapter: new PtaxUsdRateAdapter(rates, { register } as unknown as UsdRateHolder), register };
}

describe('PtaxUsdRateAdapter', () => {
    it('registra-se no holder ao subir', () => {
        const { adapter: instance, register } = adapter(null);

        instance.onModuleInit();

        expect(register).toHaveBeenCalledWith(instance);
    });

    it('devolve a PTAX recente com a data', async () => {
        const { adapter: instance } = adapter({ date: '2026-11-09', brlPerUnit: '5.4321' });

        expect(await instance.current(NOW)).toEqual({ rate: '5.4321', date: '2026-11-09', source: 'ptax' });
    });

    it('aceita a PTAX de exatamente 7 dias e recusa a de 8', async () => {
        expect((await adapter({ date: '2026-11-03', brlPerUnit: '5' }).adapter.current(NOW)).source).toBe('ptax');
        await expect(adapter({ date: '2026-11-02', brlPerUnit: '5' }).adapter.current(NOW)).rejects.toMatchObject({
            code: 'usage.rate_unavailable'
        });
    });

    it('recusa quando não há PTAX', async () => {
        await expect(adapter(null).adapter.current(NOW)).rejects.toMatchObject({ code: 'usage.rate_unavailable', status: 503 });
    });
});
