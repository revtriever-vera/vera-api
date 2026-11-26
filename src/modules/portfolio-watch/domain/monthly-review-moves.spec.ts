import { describe, expect, it } from 'vitest';
import { PriceMove, ReviewOperation } from './monthly-review.types';
import { priceMovesOf, topGainersOf, topLosersOf } from './monthly-review-moves';
import { MonthlySnapshotEntry } from './portfolio-watch.types';

function priced(assetId: string, price: string | null, kind: string = 'position', currency: string = 'BRL'): MonthlySnapshotEntry {
    return { assetId, holdingKind: kind, classId: null, quantity: '1', price, priceDate: null, valueMinor: 100, currency };
}

function move(assetId: string, variationPct: number): PriceMove {
    return { assetId, variationPct };
}

function event(assetId: string, kind: string): ReviewOperation {
    return {
        assetId,
        kind,
        tradeDate: '2026-10-10',
        settlementDate: null,
        quantity: '2',
        grossMinor: 0,
        feesMinor: 0,
        withheldTaxMinor: null,
        currency: 'BRL',
        grossBrlMinor: null,
        appliedToPosition: true
    };
}

describe('altas e quedas de preço no mês', () => {
    it('mede o preço do ativo entre as duas fotos', () => {
        const moves = priceMovesOf([priced('a', '30'), priced('b', '10')], [priced('a', '33'), priced('b', '9')], []);

        expect(moves).toEqual([move('a', 10), move('b', -10)]);
    });

    it('ignora renda fixa, ativo sem preço, sem foto do início e moeda diferente', () => {
        const moves = priceMovesOf(
            [priced('fixed', null, 'fixed_income'), priced('none', null), priced('usd', '10', 'position', 'USD')],
            [priced('fixed', null, 'fixed_income'), priced('none', null), priced('new', '5'), priced('usd', '11')],
            []
        );

        expect(moves).toEqual([]);
    });

    it('ignora o ativo que teve desdobramento, grupamento ou bonificação no mês', () => {
        const moves = priceMovesOf(
            [priced('a', '30'), priced('b', '30'), priced('c', '30'), priced('d', '30')],
            [priced('a', '15'), priced('b', '60'), priced('c', '28'), priced('d', '33')],
            [event('a', 'split'), event('b', 'reverse_split'), event('c', 'bonus')]
        );

        expect(moves).toEqual([move('d', 10)]);
    });

    it('as três maiores altas e as três maiores quedas, cada lado só com o seu sinal', () => {
        const moves: PriceMove[] = [
            move('a', 5),
            move('b', 12),
            move('c', 1),
            move('d', 7),
            move('e', -3),
            move('f', -9),
            move('g', -1),
            move('h', -4),
            move('i', 0)
        ];

        expect(topGainersOf(moves).map((item) => item.assetId)).toEqual(['b', 'd', 'a']);
        expect(topLosersOf(moves).map((item) => item.assetId)).toEqual(['f', 'h', 'e']);
    });
});
