import { describe, expect, it } from 'vitest';
import { estimateIncomeTax, regressiveRate } from './income-tax';

describe('income tax', () => {
    it.each([
        [0, '0.225'],
        [179, '0.225'],
        [180, '0.225'],
        [181, '0.20'],
        [360, '0.20'],
        [361, '0.175'],
        [720, '0.175'],
        [721, '0.15'],
        [4000, '0.15']
    ])('com %i dias a alíquota é %s', (days: number, rate: string) => {
        expect(regressiveRate(days)).toBe(rate);
    });

    it.each([
        [179, 22_500],
        [181, 20_000],
        [361, 17_500],
        [721, 15_000]
    ])('sobre rendimento de R$ 1.000,00 com %i dias o imposto é %i centavos', (days: number, expected: number) => {
        expect(estimateIncomeTax('regressive', 1_000_000, 1_100_000, days)).toBe(expected);
    });

    it('arredonda meio para cima', () => {
        expect(estimateIncomeTax('regressive', 1_000_000, 1_000_060, 400)).toBe(11);
        expect(estimateIncomeTax('regressive', 1_000_000, 1_000_002, 100)).toBe(0);
    });

    it('isento não paga e prejuízo nunca gera imposto negativo', () => {
        expect(estimateIncomeTax('exempt', 1_000_000, 1_100_000, 100)).toBe(0);
        expect(estimateIncomeTax('regressive', 1_000_000, 900_000, 100)).toBe(0);
        expect(estimateIncomeTax('regressive', 1_000_000, 1_000_000, 100)).toBe(0);
    });
});
