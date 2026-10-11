import { describe, expect, it } from 'vitest';
import { fixture } from '../../../../test/support/statement-fixtures';
import { readCsv } from './csv-reader';
import { parseNubankCardCsv } from './nubank-card-csv';
import { InvalidFileError } from './statement-import.errors';
import { decodeStatement } from './text-decoding';

function parse(text: string) {
    return parseNubankCardCsv(readCsv(text, ',', 1000).records, 'BRL');
}

describe('parseNubankCardCsv', () => {
    it('inverte o sinal: a compra positiva vira saída e o pagamento negativo vira entrada', () => {
        const statement = parse(decodeStatement(fixture('nubank-cartao.csv')));

        expect(statement.rows.map((row) => [row.date, row.amountMinor, row.description, row.externalId])).toEqual([
            ['2026-09-03', -5_590, 'Netflix', null],
            ['2026-09-09', -3_250, 'Uber *Trip', null],
            ['2026-09-10', 90_000, 'Pagamento recebido', null],
            ['2026-09-15', -1_800, 'Padaria "Estrela", Centro', null]
        ]);
        expect(statement.currency).toBeNull();
    });

    it('rejeita data, valor e descrição ruins com o número da linha', () => {
        const statement = parse('date,title,amount\n09/09/2026,x,1.00\n2026-09-09,x,abc\n2026-09-09,x,0.00\n2026-09-09,,1.00');

        expect(statement.rejections).toEqual([
            { line: 2, reason: 'invalid_date' },
            { line: 3, reason: 'invalid_amount' },
            { line: 4, reason: 'zero_amount' },
            { line: 5, reason: 'empty_description' }
        ]);
    });

    it('recusa cabeçalho diferente', () => {
        expect(() => parse('a,b,c\n1,2,3')).toThrow(InvalidFileError);
        expect(() => parseNubankCardCsv([], 'BRL')).toThrow(InvalidFileError);
    });
});
