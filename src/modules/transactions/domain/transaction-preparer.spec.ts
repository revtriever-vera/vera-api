import { describe, expect, it, vi } from 'vitest';
import { compareByDateAndExternalId, documentDigits, isIngestible, prepare, PreparationTools } from './transaction-preparer';
import { IncomingTransaction } from './transactions.types';

const tools: PreparationTools = {
    normalize: (text: string): string => text.toUpperCase(),
    hashDocument: vi.fn((digits: string): string => `k${String(digits.length)}`.padEnd(64, 'f'))
};

function incoming(overrides: Partial<IncomingTransaction> = {}): IncomingTransaction {
    return { externalId: 'pluggy:1', date: '2026-09-10', amountMinor: -5000, currency: 'BRL', description: 'Compra', ...overrides };
}

describe('isIngestible', () => {
    it('aceita a linha completa', () => {
        expect(isIngestible(incoming())).toBe(true);
    });

    it('rejeita valor zero, fracionário, inseguro, data inválida, id vazio e descrição em branco', () => {
        expect(isIngestible(incoming({ amountMinor: 0 }))).toBe(false);
        expect(isIngestible(incoming({ amountMinor: 10.5 }))).toBe(false);
        expect(isIngestible(incoming({ amountMinor: Number.MAX_SAFE_INTEGER + 2 }))).toBe(false);
        expect(isIngestible(incoming({ date: '2026-02-30' }))).toBe(false);
        expect(isIngestible(incoming({ externalId: '' }))).toBe(false);
        expect(isIngestible(incoming({ externalId: 'x'.repeat(201) }))).toBe(false);
        expect(isIngestible(incoming({ description: '   ' }))).toBe(false);
    });
});

describe('prepare', () => {
    it('o documento vira HMAC e o texto em claro é descartado', () => {
        const prepared = prepare(incoming({ counterpartyDocument: '000.000.001-91', counterpartyName: ' Maria Souza ' }), tools);

        expect(prepared.counterpartyKey).toBe('k11'.padEnd(64, 'f'));
        expect(tools.hashDocument).toHaveBeenCalledWith('00000000191');
        expect(prepared.counterpartyName).toBe('Maria Souza');
        expect(JSON.stringify(prepared)).not.toContain('00000000191');
    });

    it('sem documento ou só com símbolos não há chave', () => {
        expect(prepare(incoming(), tools).counterpartyKey).toBeNull();
        expect(prepare(incoming({ counterpartyDocument: '--' }), tools).counterpartyKey).toBeNull();
        expect(documentDigits(undefined)).toBe('');
    });

    it('trunca descrição e favorecido e normaliza a descrição', () => {
        const prepared = prepare(incoming({ description: 'a'.repeat(300), counterpartyName: 'b'.repeat(120) }), tools);

        expect(prepared.description).toHaveLength(200);
        expect(prepared.normalizedDescription).toBe('A'.repeat(200));
        expect(prepared.counterpartyName).toHaveLength(80);
    });

    it('descarta parcela inconsistente e categoria do provedor em branco', () => {
        expect(prepare(incoming({ installmentNumber: 2, installmentTotal: 5 }), tools)).toMatchObject({
            installmentNumber: 2,
            installmentTotal: 5
        });
        expect(prepare(incoming({ installmentNumber: 6, installmentTotal: 5 }), tools)).toMatchObject({
            installmentNumber: null,
            installmentTotal: null
        });
        expect(prepare(incoming({ installmentNumber: 1 }), tools)).toMatchObject({ installmentNumber: null, installmentTotal: null });
        expect(prepare(incoming({ providerCategoryId: '  ' }), tools).providerCategoryId).toBeNull();
        expect(prepare(incoming({ providerCategoryId: '17000000' }), tools).providerCategoryId).toBe('17000000');
    });
});

describe('compareByDateAndExternalId', () => {
    it('ordena por data e depois por id externo', () => {
        const base = prepare(incoming(), tools);
        const items = [
            { ...base, date: '2026-09-11', externalId: 'a' },
            { ...base, date: '2026-09-10', externalId: 'b' },
            { ...base, date: '2026-09-10', externalId: 'a' }
        ];

        expect([...items].sort(compareByDateAndExternalId).map((item) => `${item.date}/${item.externalId}`)).toEqual([
            '2026-09-10/a',
            '2026-09-10/b',
            '2026-09-11/a'
        ]);
        expect(compareByDateAndExternalId(base, { ...base })).toBe(0);
    });
});
