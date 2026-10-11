import { describe, expect, it } from 'vitest';
import { DecimalUtil } from '../../../shared/utils/decimal.util';
import { MOCK_DAILY_CDI, MOCK_MONTHLY_IPCA, MockIndexSeriesDriver } from './mock-index-series.driver';

describe('MockIndexSeriesDriver', () => {
    const driver: MockIndexSeriesDriver = new MockIndexSeriesDriver();

    it('gera CDI só em dias de semana, dentro da janela', async () => {
        const points = await driver.fetch('cdi_daily', '2025-01-03', '2025-01-07');

        expect(points.map((point) => point.date)).toEqual(['2025-01-03', '2025-01-06', '2025-01-07']);
        expect(points.every((point) => point.value === MOCK_DAILY_CDI)).toBe(true);
    });

    it('o CDI sintético equivale a cerca de 10,65% ao ano', () => {
        const annual = DecimalUtil.of(1).plus(DecimalUtil.of(MOCK_DAILY_CDI).div(100)).pow(252).minus(1);

        expect(annual.times(100).toFixed(2)).toBe('10.65');
    });

    it('gera um IPCA de 0,40% por mês, no primeiro dia de cada mês da janela', async () => {
        const points = await driver.fetch('ipca_monthly', '2025-11-15', '2026-02-10');

        expect(points).toEqual([
            { date: '2025-11-01', value: MOCK_MONTHLY_IPCA },
            { date: '2025-12-01', value: MOCK_MONTHLY_IPCA },
            { date: '2026-01-01', value: MOCK_MONTHLY_IPCA },
            { date: '2026-02-01', value: MOCK_MONTHLY_IPCA }
        ]);
    });

    it('é determinístico', async () => {
        expect(await driver.fetch('cdi_daily', '2025-01-01', '2025-03-01')).toEqual(
            await driver.fetch('cdi_daily', '2025-01-01', '2025-03-01')
        );
    });
});
