import { describe, expect, it, vi } from 'vitest';
import { UsageConfig } from '../config/usage.config';
import { UsageLogService } from '../services/usage-log.service';
import { UsageContextHolder } from './usage-context.holder';
import { UsageContextPort } from './usage-context.port';
import { UsdRateHolder } from './usd-rate.holder';
import { UsdRatePort } from './usd-rate.port';

function config(cap: number): UsageConfig {
    return {
        PAID_USAGE_CAP_MICROS: cap,
        PAID_USAGE_MIN_ROOM_MICROS: 20_000,
        PAID_USAGE_WARNING_BPS: 8000,
        USAGE_USD_BRL_FALLBACK: '5.1000',
        WHATSAPP_PRICE_TABLE: {},
        PAID_SEND_COST_MULTIPLIER: 1
    };
}

describe('UsageContextHolder', () => {
    it('sem porta registrada usa a env e o fuso de São Paulo', async () => {
        const holder: UsageContextHolder = new UsageContextHolder(config(2_500_000));

        expect(await holder.capMicros()).toBe(2_500_000);
        expect(await holder.timezone()).toBe('America/Sao_Paulo');
    });

    it('teto 0 na env significa sem teto', async () => {
        expect(await new UsageContextHolder(config(0)).capMicros()).toBeNull();
    });

    it('com porta registrada manda a porta', async () => {
        const holder: UsageContextHolder = new UsageContextHolder(config(2_500_000));
        const port: UsageContextPort = {
            capMicros: vi.fn().mockResolvedValue(900),
            timezone: vi.fn().mockResolvedValue('Asia/Tokyo')
        };

        holder.register(port);

        expect(await holder.capMicros()).toBe(900);
        expect(await holder.timezone()).toBe('Asia/Tokyo');
    });
});

describe('UsdRateHolder', () => {
    const fallbackRate = vi.fn();
    const logs: UsageLogService = { fallbackRate } as unknown as UsageLogService;

    it('sem porta usa o câmbio de reserva', async () => {
        const rate = await new UsdRateHolder(config(1), logs).current();

        expect(rate).toMatchObject({ rate: '5.1000', source: 'fallback' });
    });

    it('com porta devolve a PTAX', async () => {
        const holder: UsdRateHolder = new UsdRateHolder(config(1), logs);
        const port: UsdRatePort = { current: vi.fn().mockResolvedValue({ rate: '5.5', date: '2026-11-09', source: 'ptax' }) };
        holder.register(port);

        expect(await holder.current()).toEqual({ rate: '5.5', date: '2026-11-09', source: 'ptax' });
    });

    it('quando a porta falha cai no câmbio de reserva e avisa', async () => {
        const holder: UsdRateHolder = new UsdRateHolder(config(1), logs);
        holder.register({ current: vi.fn().mockRejectedValue(new Error('sem ptax')) });

        expect((await holder.current()).source).toBe('fallback');
        expect(fallbackRate).toHaveBeenCalledTimes(1);
    });
});
