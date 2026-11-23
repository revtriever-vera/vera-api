import { describe, expect, it } from 'vitest';
import { seriesOf } from '../../../../test/support/fixed-income-fixtures';
import { DecimalUtil } from '../../../shared/utils/decimal.util';
import { flatSeries, makeInputs, makeRates, makeScheduleTitle, monthlyIpca } from '../../../../test/support/schedule-fixtures';
import { buildRealRates } from './real-rate';
import { referenceRatesOf } from '../../fixed-income/services/index-series-math';

describe('buildRealRates', () => {
    const rates = makeRates();

    it('calcula taxa nominal, taxa real e ganho de poder de compra de um prefixado', () => {
        const inputs = makeInputs({ titles: [makeScheduleTitle({ rateBps: 1200, appliedMinor: 9_000_000, valueMinor: 10_000_000 })] });

        const [item] = buildRealRates(inputs, rates);

        const corrected: number = Math.round(9_000_000 * 1.005 ** (16 / 31 + 9));
        expect(item).toMatchObject({
            nominalAnnualBps: 1200,
            realAnnualBps: Math.round((1.12 / 1.04 - 1) * 10000),
            lowReal: false,
            estimated: false,
            taxRegime: 'regressive'
        });
        expect(Math.abs((item?.correctedMinor ?? 0) - corrected)).toBeLessThanOrEqual(1);
        expect(item?.purchasingPowerGainMinor).toBe(10_000_000 - (item?.correctedMinor ?? 0));
        expect(item?.purchasingPowerGainBps).toBe(
            Math.round(((item?.purchasingPowerGainMinor ?? 0) / (item?.correctedMinor ?? 1)) * 10000)
        );
    });

    it('marca lowReal abaixo de 3% ao ano e não em exatamente 3%', () => {
        const inputs = makeInputs({
            titles: [makeScheduleTitle({ id: 'low', rateBps: 600 }), makeScheduleTitle({ id: 'edge', name: 'Z', rateBps: 712 })]
        });

        const items = buildRealRates(inputs, rates);

        expect(items.map((item) => [item.id, item.realAnnualBps, item.lowReal])).toEqual([
            ['low', 192, true],
            ['edge', 300, false]
        ]);
    });

    it('CDI percentual e IPCA mais taxa usam a taxa nominal de cada indexador', () => {
        const inputs = makeInputs({
            titles: [
                makeScheduleTitle({ id: 'cdi', indexer: 'cdi_percent', rateBps: 11000 }),
                makeScheduleTitle({ id: 'ipca', name: 'Z', indexer: 'ipca_plus', rateBps: 600 })
            ]
        });

        const items = buildRealRates(inputs, rates);

        expect(items.map((item) => [item.id, item.nominalAnnualBps, item.realAnnualBps])).toEqual([
            ['cdi', 1100, Math.round((1.11 / 1.04 - 1) * 10000)],
            ['ipca', 1024, 600]
        ]);
    });

    it('com IPCA de 12 meses negativo a taxa real fica acima da nominal', () => {
        const series = seriesOf([], monthlyIpca('2025-01', 12, '-0.1'));
        const negative = referenceRatesOf(series);
        const inputs = makeInputs({ series, titles: [makeScheduleTitle({ rateBps: 1000, appliedAt: '2025-06-01' })] });

        const [item] = buildRealRates(inputs, negative);

        expect(negative.ipca12mBps).toBeLessThan(0);
        expect(item?.realAnnualBps).toBe(
            Math.round(
                (1.1 /
                    DecimalUtil.of(negative.ipca12m ?? 0)
                        .plus(1)
                        .toNumber() -
                    1) *
                    10000
            )
        );
        expect(item?.realAnnualBps).toBeGreaterThan(1000);
        expect(item?.purchasingPowerGainMinor).toBeGreaterThan(10_000_000 - 9_000_000);
    });

    it('só entram títulos em reais ainda não vencidos', () => {
        const inputs = makeInputs({
            titles: [
                makeScheduleTitle({ id: 'usd', currency: 'USD' }),
                makeScheduleTitle({ id: 'matured', matured: true }),
                makeScheduleTitle({ id: 'ok', name: 'Z' })
            ]
        });

        expect(buildRealRates(inputs, rates).map((item) => item.id)).toEqual(['ok']);
    });

    it('título sem cobertura do CDI fica estimado e sem taxa', () => {
        const inputs = makeInputs({ titles: [makeScheduleTitle({ indexer: 'cdi_percent', rateBps: 11000 })] });

        const [item] = buildRealRates(inputs, makeRates({ cdiAnnual: null }));

        expect(item).toMatchObject({ nominalAnnualBps: null, realAnnualBps: null, lowReal: false, estimated: true });
    });

    it('título aplicado depois do último mês publicado não tem correção e o ganho é todo o rendimento', () => {
        const inputs = makeInputs({
            titles: [makeScheduleTitle({ appliedAt: '2026-01-02', appliedMinor: 10_000_000, valueMinor: 10_050_000 })]
        });

        const [item] = buildRealRates(inputs, rates);

        expect(item).toMatchObject({ correctedMinor: 10_000_000, purchasingPowerGainMinor: 50_000, purchasingPowerGainBps: 50 });
    });

    it('sem IPCA de 12 meses não devolve linhas', () => {
        const inputs = makeInputs({ series: flatSeries(), titles: [makeScheduleTitle()] });

        expect(buildRealRates(inputs, makeRates({ ipca12m: null, ipca12mBps: null, ipcaMonth: null }))).toEqual([]);
    });

    it('ganho sobre valor corrigido zero é zero', () => {
        const inputs = makeInputs({ titles: [makeScheduleTitle({ appliedMinor: 0, valueMinor: 100 })] });

        expect(buildRealRates(inputs, rates)[0]?.purchasingPowerGainBps).toBe(0);
    });
});
