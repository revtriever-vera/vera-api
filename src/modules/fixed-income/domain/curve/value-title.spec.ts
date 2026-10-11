import { describe, expect, it } from 'vitest';
import { makeTerms, seriesOf, weekdayPoints } from '../../../../../test/support/fixed-income-fixtures';
import { FixedIncomeValuation, INDEXERS, TAX_REGIMES } from './curve.types';
import { valueTitle } from './value-title';

describe('valueTitle', () => {
    describe('prefixado', () => {
        it('R$ 50.000 a 12% ao ano por 126 dias úteis vale R$ 52.915,03', () => {
            const series = seriesOf(weekdayPoints('2025-01-06', '2025-06-30', '0.05'));
            const terms = makeTerms({ indexer: INDEXERS.prefixed, rateBps: 1200, appliedMinor: 5_000_000, appliedAt: '2025-01-06' });

            const valuation: FixedIncomeValuation = valueTitle(terms, series, '2025-07-01');

            expect(valuation).toMatchObject({
                valueMinor: 5_291_503,
                source: 'curve_pre',
                status: 'ok',
                estimated: false,
                matured: false,
                accruedBps: 583
            });
        });

        it('em dólar mantém a moeda do título', () => {
            const series = seriesOf(weekdayPoints('2025-01-06', '2025-06-30', '0.05'));
            const terms = makeTerms({ indexer: INDEXERS.prefixed, rateBps: 1200, currency: 'USD', appliedMinor: 5_000_000 });

            expect(valueTitle(terms, series, '2025-07-01')).toMatchObject({ currency: 'USD', valueMinor: 5_291_503 });
        });
    });

    describe('percentual do CDI', () => {
        const series = seriesOf(weekdayPoints('2025-01-06', '2025-02-28', '0.05', ['2025-01-08']));

        it('100% do CDI constante de 0,05% ao dia por 20 dias úteis vale R$ 101.004,76', () => {
            const valuation = valueTitle(
                makeTerms({ appliedAt: '2025-02-03' }),
                seriesOf(weekdayPoints('2025-01-06', '2025-03-03', '0.05')),
                '2025-03-03'
            );

            expect(valuation).toMatchObject({ valueMinor: 10_100_476, source: 'curve_cdi', accruedBps: 100 });
        });

        it('110% do CDI vale R$ 101.105,77', () => {
            const valuation = valueTitle(
                makeTerms({ appliedAt: '2025-02-03', rateBps: 11000 }),
                seriesOf(weekdayPoints('2025-01-06', '2025-03-03', '0.05')),
                '2025-03-03'
            );

            expect(valuation.valueMinor).toBe(10_110_577);
        });

        it('o dia da aplicação conta e o dia de hoje não', () => {
            const sameDay = valueTitle(makeTerms({ appliedAt: '2025-01-09' }), series, '2025-01-09');
            const nextDay = valueTitle(makeTerms({ appliedAt: '2025-01-09' }), series, '2025-01-10');

            expect(sameDay.valueMinor).toBe(10_000_000);
            expect(nextDay.valueMinor).toBe(10_005_000);
        });

        it('feriado (ausente da série) e fim de semana não rendem', () => {
            const withHoliday = valueTitle(makeTerms({ appliedAt: '2025-01-06' }), series, '2025-01-10');
            const overWeekend = valueTitle(makeTerms({ appliedAt: '2025-01-06' }), series, '2025-01-13');

            expect(withHoliday.valueMinor).toBe(10_015_008);
            expect(overWeekend.valueMinor).toBe(10_020_015);
        });

        it('aplicação num sábado começa a render na segunda', () => {
            const valuation = valueTitle(makeTerms({ appliedAt: '2025-01-04' }), series, '2025-01-08');

            expect(valuation.valueMinor).toBe(10_010_003);
        });
    });

    describe('IPCA+', () => {
        it('R$ 100.000 a IPCA + 6% com mês inteiro, IPCA anterior de 0,50% e 21 dias úteis vale R$ 100.989,19', () => {
            const series = seriesOf(weekdayPoints('2025-03-03', '2025-03-31', '0.05'), [{ date: '2025-02-01', value: '0.50' }]);
            const terms = makeTerms({ indexer: INDEXERS.ipcaPlus, rateBps: 600, appliedAt: '2025-03-01' });

            const valuation = valueTitle(terms, series, '2025-04-01');

            expect(valuation).toMatchObject({ valueMinor: 10_098_919, source: 'curve_ipca', estimated: false, status: 'ok' });
        });

        it('janela que cruza meses pondera cada IPCA pela fração de dias do mês', () => {
            const series = seriesOf(weekdayPoints('2025-03-03', '2025-04-15', '0.05'), [
                { date: '2025-02-01', value: '0.50' },
                { date: '2025-03-01', value: '0.40' }
            ]);
            const terms = makeTerms({ indexer: INDEXERS.ipcaPlus, rateBps: 0, appliedAt: '2025-03-16' });

            const valuation = valueTitle(terms, series, '2025-04-16');

            expect(valuation.valueMinor).toBe(10_045_807);
            expect(valuation.estimated).toBe(false);
        });

        it('IPCA do mês anterior ainda não publicado usa o último publicado e marca estimado', () => {
            const series = seriesOf(weekdayPoints('2025-04-01', '2025-04-30', '0.05'), [{ date: '2025-02-01', value: '0.40' }]);
            const terms = makeTerms({ indexer: INDEXERS.ipcaPlus, rateBps: 0, appliedAt: '2025-04-01' });

            const valuation = valueTitle(terms, series, '2025-05-01');

            expect(valuation).toMatchObject({ valueMinor: 10_040_000, estimated: true, status: 'ok' });
        });

        it('sem nenhum IPCA publicado não chuta', () => {
            const series = seriesOf(weekdayPoints('2025-04-01', '2025-04-30', '0.05'));
            const terms = makeTerms({ indexer: INDEXERS.ipcaPlus, rateBps: 600, appliedAt: '2025-04-01' });

            expect(valueTitle(terms, series, '2025-05-01')).toMatchObject({ status: 'index_data_missing', valueMinor: 10_000_000 });
        });
    });

    describe('vencimento', () => {
        const series = seriesOf(weekdayPoints('2025-01-06', '2025-03-31', '0.05'));

        it('depois do vencimento o valor congela no vencimento', () => {
            const terms = makeTerms({ appliedAt: '2025-01-06', maturityDate: '2025-01-10' });

            const atMaturity = valueTitle(terms, series, '2025-01-10');
            const later = valueTitle(terms, series, '2025-03-20');

            expect(atMaturity).toMatchObject({ matured: true, valueMinor: 10_020_015 });
            expect(later).toMatchObject({ matured: true, valueMinor: 10_020_015 });
        });

        it('antes do vencimento não está vencido', () => {
            const terms = makeTerms({ appliedAt: '2025-01-06', maturityDate: '2025-01-10' });

            expect(valueTitle(terms, series, '2025-01-09').matured).toBe(false);
        });

        it('vencido há muito tempo com a série completa não depende de projeção', () => {
            const terms = makeTerms({ appliedAt: '2025-01-06', maturityDate: '2025-01-10' });

            expect(valueTitle(terms, seriesOf(weekdayPoints('2025-01-06', '2025-01-10', '0.05')), '2026-06-01')).toMatchObject({
                matured: true,
                estimated: false,
                status: 'ok'
            });
        });
    });

    describe('série atrasada ou ausente', () => {
        it('projeta dias de semana com o último CDI e marca estimado', () => {
            const series = seriesOf(weekdayPoints('2025-01-06', '2025-01-10', '0.05'));

            const valuation = valueTitle(makeTerms({ appliedAt: '2025-01-06' }), series, '2025-01-16');

            expect(valuation).toMatchObject({ valueMinor: 10_040_070, estimated: true, status: 'ok' });
        });

        it('série vazia devolve index_data_missing com o valor aplicado', () => {
            const valuation = valueTitle(makeTerms(), seriesOf([]), '2025-06-01');

            expect(valuation).toMatchObject({
                status: 'index_data_missing',
                valueMinor: 10_000_000,
                accruedBps: 0,
                taxEstimatedMinor: 0,
                netEstimatedMinor: 10_000_000,
                estimated: false
            });
        });

        it('série parada há mais de dez dias não é projetada', () => {
            const series = seriesOf(weekdayPoints('2025-01-06', '2025-01-10', '0.05'));

            expect(valueTitle(makeTerms({ appliedAt: '2025-01-06' }), series, '2025-02-10').status).toBe('index_data_missing');
        });

        it('série que começa depois da aplicação não cobre a janela', () => {
            const series = seriesOf(weekdayPoints('2025-02-03', '2025-03-03', '0.05'));

            expect(valueTitle(makeTerms({ appliedAt: '2025-01-06' }), series, '2025-03-03').status).toBe('index_data_missing');
        });

        it('aplicado hoje não precisa de série', () => {
            expect(valueTitle(makeTerms({ appliedAt: '2025-06-02' }), seriesOf([]), '2025-06-02')).toMatchObject({
                status: 'ok',
                valueMinor: 10_000_000
            });
        });
    });

    describe('líquido estimado', () => {
        const series = seriesOf(weekdayPoints('2025-01-06', '2025-03-31', '0.05'));

        it('líquido é o bruto menos o imposto estimado', () => {
            const valuation = valueTitle(makeTerms({ appliedAt: '2025-01-06' }), series, '2025-03-03');

            expect(valuation.taxEstimatedMinor).toBe(Math.round((valuation.valueMinor - 10_000_000) * 0.225));
            expect(valuation.netEstimatedMinor).toBe(valuation.valueMinor - valuation.taxEstimatedMinor);
        });

        it('LCI e LCA são isentas', () => {
            const valuation = valueTitle(makeTerms({ taxRegime: TAX_REGIMES.exempt }), series, '2025-03-03');

            expect(valuation.taxEstimatedMinor).toBe(0);
            expect(valuation.netEstimatedMinor).toBe(valuation.valueMinor);
        });
    });
});
