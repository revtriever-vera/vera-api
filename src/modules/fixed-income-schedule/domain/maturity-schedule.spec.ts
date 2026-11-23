import { describe, expect, it } from 'vitest';
import { makeInputs, makeRates, makeScheduleTitle, makeScheduleTreasury } from '../../../../test/support/schedule-fixtures';
import { buildMaturities, reallocatableMinor } from './maturity-schedule';

describe('reallocatableMinor', () => {
    it('arredonda para baixo ao múltiplo de R$ 100', () => {
        expect(reallocatableMinor(1_234_567)).toBe(1_230_000);
        expect(reallocatableMinor(9_999)).toBe(0);
        expect(reallocatableMinor(10_000)).toBe(10_000);
    });

    it('nunca devolve negativo', () => {
        expect(reallocatableMinor(-500)).toBe(0);
    });
});

describe('buildMaturities', () => {
    it('lista títulos e Tesouro por vencimento, do mais próximo ao mais distante', () => {
        const inputs = makeInputs({
            titles: [
                makeScheduleTitle({ id: 'far', name: 'Longe', maturityDate: '2027-06-01' }),
                makeScheduleTitle({ id: 'near', name: 'Perto', maturityDate: '2026-02-01', issuerName: 'Banco Exemplo' })
            ],
            treasuries: [makeScheduleTreasury({ maturityDate: '2026-03-01' })]
        });

        const items = buildMaturities(inputs, makeRates(), 50);

        expect(items.map((item) => item.id)).toEqual(['near', 'position-1', 'far']);
        expect(items[0]).toMatchObject({
            holdingKind: 'fixed_income',
            issuerName: 'Banco Exemplo',
            kind: 'cdb',
            taxRegime: 'regressive',
            daysToMaturity: 27,
            currency: 'BRL'
        });
        expect(items[1]).toMatchObject({ holdingKind: 'position', issuerName: null, kind: null, taxRegime: null });
    });

    it('deixa de fora o título vencido e inclui o que vence hoje com zero dias', () => {
        const inputs = makeInputs({
            titles: [
                makeScheduleTitle({ id: 'past', maturityDate: '2026-01-04' }),
                makeScheduleTitle({ id: 'today', maturityDate: '2026-01-05' })
            ]
        });

        const items = buildMaturities(inputs, makeRates(), 50);

        expect(items.map((item) => item.id)).toEqual(['today']);
        expect(items[0]).toMatchObject({ daysToMaturity: 0, soon: true, estimatedValueMinor: 10_000_000 });
    });

    it('marca soon até 90 dias, inclusive', () => {
        const inputs = makeInputs({
            titles: [
                makeScheduleTitle({ id: 'edge', maturityDate: '2026-04-05' }),
                makeScheduleTitle({ id: 'after', name: 'B', maturityDate: '2026-04-06' })
            ]
        });

        const items = buildMaturities(inputs, makeRates(), 50);

        expect(items.map((item) => [item.id, item.daysToMaturity, item.soon])).toEqual([
            ['edge', 90, true],
            ['after', 91, false]
        ]);
    });

    it('calcula o valor a realocar arredondado para baixo', () => {
        const inputs = makeInputs({ titles: [makeScheduleTitle({ valueMinor: 10_012_345 })] });

        const [item] = buildMaturities(inputs, makeRates(), 50);

        expect(item).toMatchObject({ estimatedValueMinor: 11_013_580, reallocateMinor: 11_010_000, basis: 'contract', estimated: false });
    });

    it('respeita o limite e desempata por nome e id', () => {
        const inputs = makeInputs({
            titles: [
                makeScheduleTitle({ id: 'b', name: 'Mesmo' }),
                makeScheduleTitle({ id: 'a', name: 'Mesmo' }),
                makeScheduleTitle({ id: 'c', name: 'Antes' })
            ]
        });

        expect(buildMaturities(inputs, makeRates(), 2).map((item) => item.id)).toEqual(['c', 'a']);
    });

    it('converte o título em dólar pela PTAX e marca como estimado', () => {
        const inputs = makeInputs({ usdRate: '5.5', titles: [makeScheduleTitle({ currency: 'USD', valueMinor: 100_000 })] });

        const [item] = buildMaturities(inputs, makeRates(), 50);

        expect(item).toMatchObject({ estimatedValueMinor: 605_000, reallocateMinor: 600_000, estimated: true, currency: 'BRL' });
    });

    it('título em dólar sem PTAX sai com valor zero e estimado', () => {
        const inputs = makeInputs({ titles: [makeScheduleTitle({ currency: 'USD' })] });

        const [item] = buildMaturities(inputs, makeRates(), 50);

        expect(item).toMatchObject({ estimatedValueMinor: 0, reallocateMinor: 0, estimated: true });
    });

    it('sem série de índice o título indexado sai estimado com o valor de hoje', () => {
        const inputs = makeInputs({ titles: [makeScheduleTitle({ indexer: 'cdi_percent', rateBps: 11000 })] });

        const [item] = buildMaturities(inputs, makeRates({ cdiAnnual: null }), 50);

        expect(item).toMatchObject({ estimated: true, estimatedValueMinor: 10_000_000, basis: 'cdi_projection' });
    });

    it('esconde a posição do Tesouro sem cotação e vencida', () => {
        const inputs = makeInputs({
            treasuries: [
                makeScheduleTreasury({ id: 'no-quote', valueTodayMinor: null }),
                makeScheduleTreasury({ id: 'past', maturityDate: '2025-12-01' })
            ]
        });

        expect(buildMaturities(inputs, makeRates(), 50)).toEqual([]);
    });
});
