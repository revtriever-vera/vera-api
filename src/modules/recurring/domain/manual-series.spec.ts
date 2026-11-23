import { describe, expect, it } from 'vitest';
import { buildManualSeries, manualKeyOf } from './manual-series';
import { DetectorTransaction } from './recurring.types';

let sequence: number = 0;

function tx(date: string, reais: number, description: string, overrides: Partial<DetectorTransaction> = {}): DetectorTransaction {
    sequence += 1;
    return {
        id: `m${String(sequence)}`,
        accountId: 'nubank',
        date,
        amountMinor: Math.round(-reais * 100),
        normalizedDescription: description,
        counterpartyKey: null,
        categoryKey: null,
        categoryKind: null,
        dictionaryPattern: null,
        dictionaryCategory: null,
        installmentTotal: null,
        isSample: false,
        ...overrides
    };
}

const NOW: Date = new Date('2026-11-23T12:00:00Z');

describe('buildManualSeries', () => {
    it('sem cobranças parecidas é mensal, com o valor da transação e o dia dela', () => {
        const target: DetectorTransaction = tx('2026-11-12', 300, 'ACADEMIA ZEN');

        const built = buildManualSeries(target, [target], NOW);

        expect(built.fields).toMatchObject({
            merchantKey: 'ACADEMIA ZEN',
            cadence: 'monthly',
            valueMode: 'fixed',
            typicalAmountMinor: 30000,
            expectedDay: 12,
            status: 'confirmed',
            origin: 'manual',
            kind: 'other'
        });
        expect(built.charges).toEqual([{ transactionId: target.id, role: 'charge' }]);
    });

    it('com cobranças parecidas deduz a cadência, junta as cobranças e ignora outras faixas, parcelas e entradas', () => {
        const target: DetectorTransaction = tx('2026-11-05', 55.9, 'NETFLIX', {
            dictionaryPattern: 'NETFLIX',
            dictionaryCategory: 'subscriptions'
        });
        const pool: DetectorTransaction[] = [
            tx('2026-09-05', 55.9, 'NETFLIX', { dictionaryPattern: 'NETFLIX' }),
            tx('2026-10-05', 55.9, 'NETFLIX', { dictionaryPattern: 'NETFLIX' }),
            target,
            tx('2026-10-20', 12, 'NETFLIX', { dictionaryPattern: 'NETFLIX' }),
            tx('2026-10-21', 55.9, 'NETFLIX', { dictionaryPattern: 'NETFLIX', installmentTotal: 3 }),
            { ...tx('2026-10-22', 0, 'NETFLIX', { dictionaryPattern: 'NETFLIX' }), amountMinor: 5590 }
        ];

        const built = buildManualSeries(target, pool, NOW);

        expect(built.charges).toHaveLength(3);
        expect(built.fields).toMatchObject({
            cadence: 'monthly',
            kind: 'subscription',
            knownSubscription: true,
            firstDate: '2026-09-05',
            lastDate: '2026-11-05'
        });
    });

    it('valor que oscila até a tolerância fica variável e muito além dela cai para fixo no valor da transação', () => {
        const target: DetectorTransaction = tx('2026-11-05', 100, 'LOJA X');
        const steady: DetectorTransaction[] = [tx('2026-10-05', 90, 'LOJA X'), tx('2026-09-05', 110, 'LOJA X'), target];
        const wild: DetectorTransaction[] = [tx('2026-10-05', 80, 'LOJA X'), tx('2026-09-05', 120, 'LOJA X'), target];

        const variable = buildManualSeries(target, steady, NOW).fields;
        const single = buildManualSeries(target, wild, NOW).fields;

        expect([variable.valueMode, variable.minAmountMinor, variable.maxAmountMinor]).toEqual(['variable', 9000, 11000]);
        expect([single.valueMode, single.typicalAmountMinor, single.minAmountMinor]).toEqual(['fixed', 10000, 10000]);
    });

    it('a chave usa o dicionário, depois a contraparte e por fim a descrição', () => {
        expect(manualKeyOf(tx('2026-11-05', 10, 'X', { dictionaryPattern: 'SPOTIFY' }))).toBe('SPOTIFY');
        expect(manualKeyOf(tx('2026-11-05', 10, 'PIX JOAO', { counterpartyKey: 'cp-1' }))).toBe('cp-1');
        expect(manualKeyOf(tx('2026-11-05', 10, '12'))).toBe('12');
    });
});
