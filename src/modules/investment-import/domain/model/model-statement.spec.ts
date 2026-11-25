import { describe, expect, it } from 'vitest';
import { ModelUnreadableError } from '../investment-import.errors';
import { ParsedInvestmentStatement, ParsedOperation } from '../investment-statement.types';
import { statementOfModelAnswers } from './model-statement';

const TODAY: string = '2026-11-25';

function operation(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        kind: 'buy',
        direction: 'credit',
        tradeDate: '2026-11-03',
        ticker: 'PETR4',
        quantity: '100',
        unitPrice: '38.5',
        grossMinor: 385000,
        currency: 'BRL',
        ...extra
    };
}

function answer(operations: unknown[], extra: Record<string, unknown> = {}): string {
    return JSON.stringify({ documentType: 'note', currency: 'BRL', totalMinor: null, operations, ...extra });
}

function read(answers: string[], unreadPages: string[] = []): ParsedInvestmentStatement {
    return statementOfModelAnswers(answers, {
        labels: answers.map((_text: string, index: number): string => `p${String(index + 1)}`),
        unreadPages,
        today: TODAY
    });
}

function checkOf(statement: ParsedInvestmentStatement, index: number = 0): string | undefined {
    return (statement.operations[index] as ParsedOperation).check;
}

describe('statementOfModelAnswers', () => {
    it('vira o extrato com source model e o tipo de documento lido', () => {
        const statement: ParsedInvestmentStatement = read([answer([operation()])]);

        expect(statement.source).toBe('model');
        expect(statement.documentType).toBe('note');
        expect(statement.operations).toHaveLength(1);
        expect(statement.operations[0]).toMatchObject({
            ticker: 'PETR4',
            kind: 'buy',
            quantity: '100',
            unitPrice: '38.5',
            grossMinor: 385000,
            appliedToPosition: true,
            alreadyImported: false,
            matchKey: '2026-11-03|PETR4|buy|100|38.5'
        });
        expect(checkOf(statement)).toBeUndefined();
    });

    it('operations e notes null (print, PDF de posição) valem como lista vazia', () => {
        const text: string = JSON.stringify({
            documentType: 'screenshot',
            currency: 'BRL',
            operations: null,
            notes: null,
            positions: []
        });
        const statement: ParsedInvestmentStatement = read([text]);
        expect(statement.documentType).toBe('screenshot');
        expect(statement.operations).toEqual([]);
    });

    it('conta que não bate vira check e a linha continua', () => {
        const statement: ParsedInvestmentStatement = read([answer([operation({ grossMinor: 390000 })])]);

        expect(statement.operations).toHaveLength(1);
        expect(checkOf(statement)).toBe('amount_mismatch');
    });

    it('arredondamento de centavos não é divergência', () => {
        const statement: ParsedInvestmentStatement = read([answer([operation({ quantity: '3', unitPrice: '10.333', grossMinor: 3100 })])]);

        expect(checkOf(statement)).toBeUndefined();
    });

    it('soma dos negócios contra o total impresso: não bateu marca todas as linhas', () => {
        const rows: unknown[] = [operation(), operation({ ticker: 'VALE3', unitPrice: '60', grossMinor: 600000, quantity: '100' })];

        expect(read([answer(rows, { totalMinor: 985000 })]).operations.map((line: ParsedOperation) => line.check)).toEqual([
            undefined,
            undefined
        ]);
        expect(read([answer(rows, { totalMinor: 900000 })]).operations.map((line: ParsedOperation) => line.check)).toEqual([
            'total_mismatch',
            'total_mismatch'
        ]);
    });

    it('data no futuro ou impossível vira check de data', () => {
        expect(checkOf(read([answer([operation({ tradeDate: '2026-12-31' })])]))).toBe('date_out_of_range');
        expect(checkOf(read([answer([operation({ tradeDate: '2026-02-31' })])]))).toBe('date_out_of_range');
        expect(checkOf(read([answer([operation({ tradeDate: '1980-01-02' })])]))).toBe('date_out_of_range');
    });

    it('sem preço mas com valor, o preço sai da divisão; sem os dois, fica nulo', () => {
        const derived: ParsedInvestmentStatement = read([answer([operation({ unitPrice: null, grossMinor: 385000 })])]);
        const bare: ParsedInvestmentStatement = read([answer([operation({ unitPrice: null, grossMinor: null })])]);

        expect(derived.operations[0]?.unitPrice).toBe('38.5');
        expect(bare.operations[0]?.unitPrice).toBeNull();
    });

    it('linha ilegível vai para as rejeitadas e as outras seguem', () => {
        const statement: ParsedInvestmentStatement = read([
            answer([operation({ tradeDate: null }), operation({ quantity: '1,5' }), operation({ ticker: '' }), operation()])
        ]);

        expect(statement.operations).toHaveLength(1);
        expect(statement.rejected.map((line) => line.reason)).toEqual(['invalid_date', 'invalid_quantity', 'missing_asset']);
    });

    it('opção e termo ficam de fora com o motivo', () => {
        const statement: ParsedInvestmentStatement = read([
            answer([
                operation({ market: 'OPÇÃO DE COMPRA', ticker: 'PETRK400' }),
                operation({ market: 'Termo' }),
                operation({ market: 'Fracionário', ticker: 'VALE3F' })
            ])
        ]);

        expect(statement.ignored.map((line) => line.reason)).toEqual(['unsupported_market', 'unsupported_market']);
        expect(statement.operations.map((line) => line.ticker)).toEqual(['VALE3']);
    });

    it('junta as páginas e registra as que ficaram sem leitura', () => {
        const statement: ParsedInvestmentStatement = read(
            [answer([operation()], { totalMinor: 385000 }), answer([operation({ ticker: 'ITUB4' })], { totalMinor: 385000 })],
            ['p3']
        );

        expect(statement.operations.map((line) => line.ticker)).toEqual(['PETR4', 'ITUB4']);
        expect(statement.ignored).toEqual([expect.objectContaining({ reason: 'page_not_read', sheet: 'p3' })]);
    });

    it.each([['texto solto'], ['{"operations":[]}'], ['{"documentType":"note","currency":"BRL","operations":"x"}'], ['[]']])(
        'resposta fora do formato (%s) é ilegível',
        (text: string) => {
            expect(() => read([text])).toThrow(ModelUnreadableError);
        }
    );
});
