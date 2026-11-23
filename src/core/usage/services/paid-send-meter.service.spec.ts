import { describe, expect, it, vi } from 'vitest';
import { UsageConfig } from '../config/usage.config';
import { UsdRateHolder } from '../ports/usd-rate.holder';
import { PaidSendMeter } from './paid-send-meter.service';
import { PaidUsageMeter } from './paid-usage-meter.service';

const TABLE: UsageConfig['WHATSAPP_PRICE_TABLE'] = {
    authentication: { currency: 'USD', amount: '0.10', date: '2026-01-01', source: 'teste' },
    utility: { currency: 'BRL', amount: '0.30', date: '2026-01-01', source: 'teste' }
};

function build(multiplier: number = 1) {
    const record = vi.fn().mockResolvedValue(undefined);
    const config: UsageConfig = {
        PAID_USAGE_CAP_MICROS: 4_000_000,
        PAID_USAGE_WARNING_BPS: 8000,
        USAGE_USD_BRL_FALLBACK: '5.0000',
        WHATSAPP_PRICE_TABLE: TABLE,
        PAID_SEND_COST_MULTIPLIER: multiplier
    };
    const rates = { current: vi.fn().mockResolvedValue({ rate: '5.5', date: '2026-11-09', source: 'ptax' }) };
    const meter: PaidSendMeter = new PaidSendMeter(config, rates as unknown as UsdRateHolder, { record } as unknown as PaidUsageMeter);
    return { meter, record, rates };
}

describe('PaidSendMeter', () => {
    it('estima pela categoria: USD converte pela taxa, BRL entra direto', async () => {
        const { meter } = build();

        expect(await meter.estimate('authentication')).toBe(550_000);
        expect(await meter.estimate('utility')).toBe(300_000);
    });

    it('o multiplicador escala o custo e preserva o preço do provedor', async () => {
        const { meter, record } = build(2);

        await meter.record({ kind: 'whatsapp_template', category: 'authentication', task: 'link-code', referenceId: 'wamid.1' });

        expect(record).toHaveBeenCalledWith({
            feature: 'whatsapp',
            task: 'link-code',
            referenceId: 'wamid.1',
            costMicros: 1_100_000,
            providerCostMicros: 550_000,
            usdBrlRate: '5.5',
            outcome: 'answered',
            detail: { category: 'authentication' }
        });
        expect(await meter.estimate('utility')).toBe(600_000);
    });

    it('preço em BRL não grava taxa de câmbio', async () => {
        const { meter, record, rates } = build();

        await meter.record({ kind: 'whatsapp_template', category: 'utility', task: 'reminder', referenceId: 'wamid.2' });

        expect(record).toHaveBeenCalledWith(expect.objectContaining({ costMicros: 300_000, usdBrlRate: undefined }));
        expect(rates.current).not.toHaveBeenCalled();
    });

    it('categoria sem preço na tabela falha com usage.price_unavailable', async () => {
        await expect(build().meter.estimate('marketing')).rejects.toMatchObject({ code: 'usage.price_unavailable', status: 503 });
    });
});
