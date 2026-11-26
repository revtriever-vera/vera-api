import { describe, expect, it } from 'vitest';
import { COVERAGE_REASONS, ClassReturn, ReviewOperation } from './monthly-review.types';
import { ReturnsInput, dietzReturn, returnsOf } from './monthly-review-returns';
import { MonthlySnapshotEntry } from './portfolio-watch.types';

const EQUITY: string = '0199b5b8-1c2d-7000-8000-0000000000a1';
const FIXED: string = '0199b5b8-1c2d-7000-8000-0000000000a2';
const ITUB: string = '0199b5b8-1c2d-7000-8000-0000000000b1';
const VALE: string = '0199b5b8-1c2d-7000-8000-0000000000b2';
const TITLE: string = '0199b5b8-1c2d-7000-8000-0000000000b3';

function entry(
    assetId: string,
    classId: string,
    quantity: string | null,
    valueMinor: number,
    kind: string = 'position'
): MonthlySnapshotEntry {
    return { assetId, holdingKind: kind, classId, quantity, price: null, priceDate: null, valueMinor, currency: 'BRL' };
}

function operation(overrides: Partial<ReviewOperation>): ReviewOperation {
    return {
        assetId: ITUB,
        kind: 'buy',
        tradeDate: '2026-10-16',
        settlementDate: null,
        quantity: '50',
        grossMinor: 160_000,
        feesMinor: 0,
        withheldTaxMinor: null,
        currency: 'BRL',
        grossBrlMinor: null,
        appliedToPosition: true,
        ...overrides
    };
}

function input(overrides: Partial<ReturnsInput>): ReturnsInput {
    return {
        month: '2026-10',
        baseCurrency: 'BRL',
        start: [entry(ITUB, EQUITY, '100', 300_000)],
        end: [entry(ITUB, EQUITY, '150', 495_000)],
        operations: [operation({})],
        hasHistory: true,
        incomeByAsset: new Map(),
        ...overrides
    };
}

describe('rentabilidade do mês pelo histórico de operações', () => {
    it('com aporte no meio do mês pesa o aporte pelos dias que ficou na carteira', () => {
        const result = returnsOf(input({}));

        expect(result.reason).toBeNull();
        expect(result.returnPct).toBeCloseTo(9.15, 2);
        expect(result.byClass).toEqual([{ classId: EQUITY, startMinor: 300_000, endMinor: 495_000, returnPct: 9.15 }]);
    });

    it('com resgate no meio do mês tira o dinheiro que saiu do ganho e da base', () => {
        const result = returnsOf(
            input({
                end: [entry(ITUB, EQUITY, '60', 210_000)],
                operations: [operation({ kind: 'sell', quantity: '40', tradeDate: '2026-10-11', grossMinor: 140_000 })]
            })
        );

        expect(result.returnPct).toBeCloseTo(24.37, 2);
    });

    it('soma os proventos ao ganho sem tratá-los como aporte', () => {
        const result = returnsOf(input({ incomeByAsset: new Map([[ITUB, 5000]]) }));

        expect(result.returnPct).toBeCloseTo(10.46, 2);
    });

    it('as corretagens entram no custo do aporte', () => {
        const result = returnsOf(input({ operations: [operation({ feesMinor: 1000 })] }));

        expect(result.returnPct).toBeCloseTo(8.9, 1);
    });

    it('classe que não fecha com o histórico fica sem rentabilidade, e o total some junto', () => {
        const result = returnsOf(
            input({
                start: [entry(ITUB, EQUITY, '100', 300_000), entry(VALE, FIXED, '10', 100_000)],
                end: [entry(ITUB, EQUITY, '150', 495_000), entry(VALE, FIXED, '20', 210_000)]
            })
        );

        const byClass: Record<string, ClassReturn | undefined> = Object.fromEntries(result.byClass.map((row) => [row.classId, row]));
        expect(byClass[EQUITY]?.returnPct).toBeCloseTo(9.15, 2);
        expect(byClass[FIXED]).toMatchObject({ reason: 'quantity_mismatch' });
        expect(byClass[FIXED]?.returnPct).toBeUndefined();
        expect(result.returnPct).toBeUndefined();
        expect(result.reason).toBe(COVERAGE_REASONS.classesNotClosing);
    });

    it('conta sem nenhuma operação importada não tem rentabilidade', () => {
        const result = returnsOf(input({ operations: [], hasHistory: false, end: [entry(ITUB, EQUITY, '100', 330_000)] }));

        expect(result.returnPct).toBeUndefined();
        expect(result.reason).toBe(COVERAGE_REASONS.noOperations);
        expect(result.byClass).toEqual([{ classId: EQUITY, startMinor: 300_000, endMinor: 330_000 }]);
    });

    it('primeiro mês, sem foto do início, não tem rentabilidade', () => {
        const result = returnsOf(input({ start: [] }));

        expect(result.returnPct).toBeUndefined();
        expect(result.reason).toBe(COVERAGE_REASONS.noPreviousSnapshot);
    });

    it('posição que não muda de quantidade fecha sem operação no mês', () => {
        const result = returnsOf(input({ end: [entry(ITUB, EQUITY, '100', 330_000)], operations: [] }));

        expect(result.returnPct).toBeCloseTo(10, 2);
    });

    it('desdobramento e bonificação mexem na quantidade sem mexer no dinheiro', () => {
        const result = returnsOf(
            input({
                end: [entry(ITUB, EQUITY, '220', 330_000)],
                operations: [
                    operation({ kind: 'split', quantity: '2' }),
                    operation({ kind: 'bonus', quantity: '20', tradeDate: '2026-10-20' })
                ]
            })
        );

        expect(result.returnPct).toBeCloseTo(10, 2);
    });

    it('operação fora da posição (day trade ou só histórico) não entra no fluxo', () => {
        const result = returnsOf(
            input({ end: [entry(ITUB, EQUITY, '100', 330_000)], operations: [operation({ appliedToPosition: false })] })
        );

        expect(result.returnPct).toBeCloseTo(10, 2);
    });

    it('título de renda fixa nas duas fotos fecha, e o que aparece ou some no mês não', () => {
        const kept = returnsOf(
            input({
                start: [entry(TITLE, FIXED, null, 100_000, 'fixed_income')],
                end: [entry(TITLE, FIXED, null, 101_000, 'fixed_income')],
                operations: []
            })
        );
        const bought = returnsOf(
            input({
                start: [entry(ITUB, EQUITY, '100', 300_000)],
                end: [entry(TITLE, FIXED, null, 50_000, 'fixed_income'), entry(ITUB, EQUITY, '100', 300_000)],
                operations: []
            })
        );

        expect(kept.returnPct).toBeCloseTo(1, 2);
        expect(bought.returnPct).toBeUndefined();
        expect(bought.byClass.find((row: ClassReturn) => row.classId === FIXED)?.reason).toBe('fixed_income_flow_unknown');
    });

    it('operação de ativo que não está em nenhuma foto vai para fora de classe e derruba o total', () => {
        const result = returnsOf(input({ operations: [operation({}), operation({ assetId: VALE, quantity: '5' })] }));

        expect(result.returnPct).toBeUndefined();
        expect(result.byClass.find((row: ClassReturn) => row.classId === null)?.reason).toBe('asset_without_snapshot');
    });

    it('fluxo em outra moeda sem conversão para a moeda base derruba a classe', () => {
        const result = returnsOf(input({ operations: [operation({ currency: 'USD' })] }));

        expect(result.returnPct).toBeUndefined();
        expect(result.byClass[0]?.reason).toBe('unconvertible_flow');
    });

    it('fluxo em dólar vira reais pelo valor em reais gravado na operação', () => {
        const result = returnsOf(
            input({ operations: [operation({ currency: 'USD', grossMinor: 32_000, feesMinor: 0, grossBrlMinor: 160_000 })] })
        );

        expect(result.returnPct).toBeCloseTo(9.15, 2);
    });

    it('sem base positiva não calcula', () => {
        expect(dietzReturn(0, 100, [], 0)).toBeNull();
        const result = returnsOf(input({ start: [entry(ITUB, EQUITY, '0', 0)], end: [entry(ITUB, EQUITY, '0', 0)], operations: [] }));

        expect(result.returnPct).toBeUndefined();
        expect(result.reason).toBe(COVERAGE_REASONS.classesNotClosing);
    });
});
