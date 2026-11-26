import { describe, expect, it } from 'vitest';
import { ReviewLedgerEntry, ReviewOperation } from './monthly-review.types';
import { monthIncomeOf } from './review-income';

function income(overrides: Partial<ReviewOperation>): ReviewOperation {
    return {
        assetId: 'a',
        kind: 'income',
        tradeDate: '2026-10-20',
        settlementDate: null,
        quantity: '100',
        grossMinor: 5000,
        feesMinor: 0,
        withheldTaxMinor: null,
        currency: 'BRL',
        grossBrlMinor: null,
        appliedToPosition: false,
        ...overrides
    };
}

const LEDGER: ReviewLedgerEntry[] = [
    { assetId: 'a', amountMinor: 7800, currency: 'BRL' },
    { assetId: 'b', amountMinor: 100, currency: 'USD' }
];

describe('proventos do mês', () => {
    it('vêm do histórico quando há provento importado, líquidos do imposto retido', () => {
        const result = monthIncomeOf([income({ withheldTaxMinor: 750 }), income({ assetId: 'b', grossMinor: 1000 })], LEDGER, 'BRL');

        expect(result.result).toEqual({ amountMinor: 5250, source: 'operations' });
        expect(result.byAsset.get('a')).toBe(4250);
    });

    it('vêm do livro da data-com quando não há provento no histórico, só na moeda base', () => {
        const result = monthIncomeOf([], LEDGER, 'BRL');

        expect(result.result).toEqual({ amountMinor: 7800, source: 'ledger' });
    });

    it('sem nada, é zero pelo livro', () => {
        expect(monthIncomeOf([], [], 'BRL').result).toEqual({ amountMinor: 0, source: 'ledger' });
    });

    it('provento em dólar entra em reais pelo valor gravado na operação', () => {
        const result = monthIncomeOf([income({ currency: 'USD', grossMinor: 1000, grossBrlMinor: 5500 })], [], 'BRL');

        expect(result.result.amountMinor).toBe(5500);
    });
});
