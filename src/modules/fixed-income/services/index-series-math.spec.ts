import { describe, expect, it } from 'vitest';
import { seriesOf } from '../../../../test/support/fixed-income-fixtures';
import { flatSeries, monthlyIpca } from '../../../../test/support/schedule-fixtures';
import { DecimalUtil } from '../../../shared/utils/decimal.util';
import { buildIpcaSeries } from '../domain/curve/ipca-factor';
import { accumulatedInflation, businessDaysBetween, calendarDaysBetween, compoundFactor, referenceRatesOf } from './index-series-math';

describe('businessDaysBetween', () => {
    it('conta 252 dias úteis entre uma segunda e a quarta 352 dias depois', () => {
        expect(businessDaysBetween('2026-01-05', '2026-12-23')).toBe(252);
    });

    it('conta uma semana cheia como cinco dias úteis', () => {
        expect(businessDaysBetween('2026-01-05', '2026-01-12')).toBe(5);
    });

    it('não conta o dia final e pula o fim de semana', () => {
        expect(businessDaysBetween('2026-01-09', '2026-01-13')).toBe(2);
    });

    it('devolve zero quando as datas são iguais ou invertidas', () => {
        expect(businessDaysBetween('2026-01-05', '2026-01-05')).toBe(0);
        expect(businessDaysBetween('2026-01-06', '2026-01-05')).toBe(0);
    });

    it('começando num sábado conta só os dias úteis que sobram', () => {
        expect(businessDaysBetween('2026-01-10', '2026-01-17')).toBe(5);
    });
});

describe('calendarDaysBetween e compoundFactor', () => {
    it('conta dias corridos', () => {
        expect(calendarDaysBetween('2026-01-05', '2026-04-05')).toBe(90);
    });

    it('capitaliza a taxa anual por 252 dias úteis como um ano inteiro', () => {
        expect(compoundFactor(DecimalUtil.of('0.10'), '2026-01-05', '2026-12-23').toNumber()).toBe(1.1);
    });
});

describe('referenceRatesOf', () => {
    it('anualiza o último CDI diário em 252 dias úteis e acumula o IPCA dos últimos 12 meses', () => {
        const rates = referenceRatesOf(
            seriesOf(
                [
                    { date: '2026-01-01', value: '0.04' },
                    { date: '2026-01-02', value: '0.05' }
                ],
                monthlyIpca('2024-12', 13, '0.4')
            )
        );

        expect(rates.cdiAnnualBps).toBe(Math.round((1.0005 ** 252 - 1) * 10000));
        expect(rates.cdiDate).toBe('2026-01-02');
        expect(rates.ipca12mBps).toBe(Math.round((1.004 ** 12 - 1) * 10000));
        expect(rates.ipcaMonth).toBe('2025-12');
    });

    it('usa só os 12 últimos meses publicados', () => {
        const points = [...monthlyIpca('2024-01', 12, '5'), ...monthlyIpca('2025-01', 12, '0.1')];

        const rates = referenceRatesOf(seriesOf([], points));

        expect(rates.ipca12mBps).toBe(Math.round((1.001 ** 12 - 1) * 10000));
    });

    it('acumula um IPCA negativo de 12 meses', () => {
        const rates = referenceRatesOf(seriesOf([], monthlyIpca('2025-01', 12, '-0.1')));

        expect(rates.ipca12mBps).toBe(Math.round((0.999 ** 12 - 1) * 10000));
        expect(rates.ipca12mBps).toBeLessThan(0);
    });

    it('sem série devolve tudo nulo', () => {
        expect(referenceRatesOf(seriesOf([]))).toEqual({
            cdiAnnual: null,
            cdiAnnualBps: null,
            cdiDate: null,
            ipca12m: null,
            ipca12mBps: null,
            ipcaMonth: null
        });
    });

    it('com menos de 12 meses ou com buraco no meio não tem IPCA de 12 meses', () => {
        const withGap = [...monthlyIpca('2024-01', 6, '0.4'), ...monthlyIpca('2024-08', 6, '0.4')];

        expect(referenceRatesOf(seriesOf([], monthlyIpca('2025-01', 11, '0.4'))).ipca12m).toBeNull();
        expect(referenceRatesOf(seriesOf([], withGap)).ipca12m).toBeNull();
    });

    it('lê o IPCA de 24 meses da fixture', () => {
        expect(referenceRatesOf(flatSeries()).ipcaMonth).toBe('2025-12');
    });
});

describe('accumulatedInflation', () => {
    const ipca = buildIpcaSeries(monthlyIpca('2024-01', 24, '0.5'));

    it('acumula meses inteiros da série', () => {
        const inflation = accumulatedInflation(ipca, '2025-01-01', '2025-12');

        expect(inflation.factor.toNumber()).toBeCloseTo(1.005 ** 12, 10);
        expect(inflation.estimated).toBe(false);
    });

    it('proporciona o mês da aplicação pelos dias que restam', () => {
        const inflation = accumulatedInflation(ipca, '2025-03-16', '2025-12');

        expect(inflation.factor.toNumber()).toBeCloseTo(1.005 ** (16 / 31 + 9), 10);
    });

    it('aplicação depois do último mês publicado não corrige nada', () => {
        const inflation = accumulatedInflation(ipca, '2026-02-10', '2025-12');

        expect(inflation.factor.toNumber()).toBe(1);
        expect(inflation.estimated).toBe(false);
    });

    it('aplicação antes do início da série corrige só o que a série cobre e marca estimado', () => {
        const inflation = accumulatedInflation(ipca, '2023-11-01', '2024-02');

        expect(inflation.factor.toNumber()).toBeCloseTo(1.005 ** 2, 10);
        expect(inflation.estimated).toBe(true);
    });
});
