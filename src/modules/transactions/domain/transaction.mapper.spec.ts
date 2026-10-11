import { describe, expect, it } from 'vitest';
import { makeFinancialAccount, makeTransaction, makeTransactionImport } from '../../../../test/support/spending-factories';
import { chunkOf } from './collections';
import {
    toAccountKind,
    toAccountView,
    toCategoryOrigin,
    toImportFormat,
    toImportStatus,
    toImportView,
    toSource,
    toTransactionView
} from './transaction.mapper';

describe('transaction mapper', () => {
    it('monta a visão da transação com valor inteiro, data de calendário e parcela', () => {
        const view = toTransactionView(
            makeTransaction({
                id: 't1',
                accountId: 'a1',
                amountMinor: '-229560',
                date: new Date(2026, 8, 22),
                categorySource: 'user',
                source: 'ofx',
                installmentNumber: 2,
                installmentTotal: 5,
                counterpartyName: 'Maria Souza'
            }),
            'Nubank'
        );

        expect(view).toMatchObject({
            id: 't1',
            accountName: 'Nubank',
            amountMinor: -229560,
            date: '2026-09-22',
            categorySource: 'user',
            source: 'ofx',
            installment: { number: 2, total: 5 },
            counterpartyName: 'Maria Souza'
        });
        expect(toTransactionView(makeTransaction(), 'X').installment).toBeNull();
    });

    it('monta a visão da conta pela origem e pelas estatísticas', () => {
        const stats = { accountId: 'a', transactionCount: 4, lastTransactionDate: '2026-09-30' };

        expect(toAccountView(makeFinancialAccount({ provider: 'pluggy', externalId: 'x', kind: 'credit_card' }), stats)).toMatchObject({
            source: 'pluggy',
            kind: 'credit_card',
            transactionCount: 4,
            lastTransactionDate: '2026-09-30'
        });
        expect(toAccountView(makeFinancialAccount(), undefined)).toMatchObject({
            source: 'file',
            transactionCount: 0,
            lastTransactionDate: null
        });
    });

    it('monta a visão do lote com o período', () => {
        expect(toImportView(makeTransactionImport({ id: 'i1' }))).toMatchObject({
            id: 'i1',
            format: 'ofx',
            periodStart: '2026-09-01',
            periodEnd: '2026-09-30',
            status: 'completed',
            createdAt: '2026-10-01T10:00:00.000Z'
        });
        expect(toImportView(makeTransactionImport({ periodStart: null, periodEnd: null }))).toMatchObject({
            periodStart: null,
            periodEnd: null
        });
    });

    it('valores desconhecidos caem num padrão seguro', () => {
        expect(toAccountKind('savings')).toBe('savings');
        expect(toAccountKind('banana')).toBe('other');
        expect(toSource('csv')).toBe('csv');
        expect(toSource('banana')).toBe('sample');
        expect(toCategoryOrigin('rule')).toBe('rule');
        expect(toCategoryOrigin('banana')).toBe('none');
        expect(toImportFormat('csv_nubank_card')).toBe('csv_nubank_card');
        expect(toImportFormat('banana')).toBe('csv_generic');
        expect(toImportStatus('undone')).toBe('undone');
        expect(toImportStatus('banana')).toBe('failed');
    });
});

describe('chunkOf', () => {
    it('divide em pedaços do tamanho pedido', () => {
        expect(chunkOf([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
        expect(chunkOf([], 2)).toEqual([]);
    });
});
