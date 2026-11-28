import { describe, expect, it } from 'vitest';
import { readingOfModelAnswers, statementOfReading } from './model-reading';
import { InvalidFileError, ModelUnreadableError } from './statement-import.errors';

function answer(transactions: unknown[], extra: Record<string, unknown> = {}): string {
    return JSON.stringify({ currency: 'BRL', institution: null, accountLast4: null, transactions, ...extra });
}

const SALARY: Record<string, unknown> = { date: '2026-10-01', description: 'SALARIO EMPRESA EXEMPLO', amountMinor: 500000 };
const UBER: Record<string, unknown> = { date: '2026-10-02', description: 'UBER *TRIP', amountMinor: -3250 };

function reasonOf(work: () => unknown): unknown {
    try {
        work();
    } catch (error: unknown) {
        return error instanceof ModelUnreadableError ? error.meta?.['reason'] : error;
    }
    return null;
}

describe('readingOfModelAnswers', () => {
    it('junta as respostas das páginas, numera as linhas e guarda moeda e dica da conta', () => {
        const reading = readingOfModelAnswers(
            [answer([SALARY]), answer([UBER], { currency: null, institution: 'Banco Exemplo', accountLast4: '4321' })],
            ['p3']
        );

        expect(reading.rows).toEqual([
            { line: 1, date: '2026-10-01', amountMinor: 500000, description: 'SALARIO EMPRESA EXEMPLO', externalId: null },
            { line: 2, date: '2026-10-02', amountMinor: -3250, description: 'UBER *TRIP', externalId: null }
        ]);
        expect(reading.currency).toBe('BRL');
        expect(reading.accountHint).toEqual({ institution: 'Banco Exemplo', numberLast4: '4321' });
        expect(reading.pagesNotRead).toEqual(['p3']);
    });

    it('linha com data impossível, valor zero, fracionado ou sem descrição vira rejeição, sem derrubar a leitura', () => {
        const reading = readingOfModelAnswers(
            [
                answer([
                    SALARY,
                    { ...UBER, date: '2026-02-30' },
                    { ...UBER, amountMinor: 0 },
                    { ...UBER, amountMinor: 10.5 },
                    { ...UBER, description: '  ' },
                    { nada: true }
                ])
            ],
            []
        );

        expect(reading.rows).toHaveLength(1);
        expect(reading.rejections.map((rejection) => rejection.reason)).toEqual([
            'invalid_date',
            'zero_amount',
            'invalid_amount',
            'empty_description',
            'invalid_date'
        ]);
    });

    it('moeda ilegível e dica ausente ficam nulas', () => {
        const reading = readingOfModelAnswers([answer([SALARY], { currency: 'reais' })], []);

        expect(reading.currency).toBeNull();
        expect(reading.accountHint).toBeNull();
    });

    it('não consegui ler: nenhuma transação válida ou resposta fora do esquema pedem outro arquivo', () => {
        expect(reasonOf(() => readingOfModelAnswers([answer([])], []))).toBe('no_transactions');
        expect(reasonOf(() => readingOfModelAnswers([answer([{ ...UBER, amountMinor: 0 }])], []))).toBe('no_transactions');
        expect(reasonOf(() => readingOfModelAnswers(['isto não é JSON'], []))).toBe('invalid_response');
        expect(reasonOf(() => readingOfModelAnswers([JSON.stringify({ currency: 'BRL' })], []))).toBe('invalid_response');
    });

    it('período de mais de cinco anos é recusado como no OFX', () => {
        expect(() => readingOfModelAnswers([answer([SALARY, { ...UBER, date: '2019-01-01' }])], [])).toThrow(InvalidFileError);
    });
});

describe('statementOfReading', () => {
    it('vira um extrato no formato model, sem colunas nem mapping pendente', () => {
        const reading = readingOfModelAnswers([answer([SALARY])], []);

        expect(statementOfReading(reading)).toMatchObject({ format: 'model', columns: null, pendingMappingRecords: null, currency: 'BRL' });
    });
});
