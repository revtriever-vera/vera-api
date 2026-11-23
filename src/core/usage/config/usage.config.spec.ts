import { afterEach, describe, expect, it, vi } from 'vitest';
import { usageConfig } from './usage.config';

describe('usageConfig', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('usa os padrões sem env', () => {
        vi.stubEnv('PAID_USAGE_CAP_MICROS', undefined);
        vi.stubEnv('PAID_USAGE_WARNING_BPS', undefined);
        vi.stubEnv('USAGE_USD_BRL_FALLBACK', undefined);
        vi.stubEnv('WHATSAPP_PRICE_TABLE', undefined);
        vi.stubEnv('PAID_SEND_COST_MULTIPLIER', undefined);

        expect(usageConfig()).toEqual({
            PAID_USAGE_CAP_MICROS: 4_000_000,
            PAID_USAGE_WARNING_BPS: 8000,
            USAGE_USD_BRL_FALLBACK: '5.0000',
            WHATSAPP_PRICE_TABLE: expect.objectContaining({
                utility: expect.objectContaining({ currency: 'USD', amount: '0.0068' })
            }),
            PAID_SEND_COST_MULTIPLIER: 1
        });
    });

    it('lê a tabela de preço em JSON', () => {
        vi.stubEnv(
            'WHATSAPP_PRICE_TABLE',
            JSON.stringify({ utility: { currency: 'USD', amount: '0.01', date: '2026-01-01', source: 'tabela' } })
        );

        expect(usageConfig().WHATSAPP_PRICE_TABLE.utility).toEqual({
            currency: 'USD',
            amount: '0.01',
            date: '2026-01-01',
            source: 'tabela'
        });
    });

    it('falha com tabela inválida ou fora do formato', () => {
        vi.stubEnv('WHATSAPP_PRICE_TABLE', '{nao json');
        expect(() => usageConfig()).toThrow();
        vi.stubEnv('WHATSAPP_PRICE_TABLE', JSON.stringify({ utility: { currency: 'EUR', amount: '1', date: 'x', source: 'y' } }));
        expect(() => usageConfig()).toThrow();
        vi.stubEnv('WHATSAPP_PRICE_TABLE', JSON.stringify({ outro: {} }));
        expect(() => usageConfig()).toThrow();
    });
});
